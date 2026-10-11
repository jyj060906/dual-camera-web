import { getSupabase } from "./supabase";

export type Visibility = "public" | "friends" | "private";
export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: "공개",
  friends: "친구공개",
  private: "비공개",
};
export const CAPTION_MAX = 500;

export type Post = {
  id: string;
  caption: string;
  visibility: Visibility;
  created_at: string;
  imageUrl: string; // 잠깐 쓰는 서명된 주소(게시물 이미지는 비공개 저장소에 있다)
};

const SIGNED_SECONDS = 60 * 60;

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// 내 게시물을 내가 정한 순서대로 가져온다. 새 글은 맨 앞이다(기본 정렬은 확정 전의 임시 값).
export async function listMyPosts(): Promise<Post[]> {
  const sb = getSupabase();
  const rows = must(
    await sb
      .from("posts")
      .select("id, caption, visibility, created_at, image_path")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
  );
  if (rows.length === 0) return [];
  const signed = must(
    await sb.storage.from("posts").createSignedUrls(
      rows.map((r) => r.image_path),
      SIGNED_SECONDS,
    ),
  );
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({
    id: r.id,
    caption: r.caption,
    visibility: r.visibility as Visibility,
    created_at: r.created_at,
    imageUrl: urlByPath.get(r.image_path) ?? "",
  }));
}

export async function createPost(
  userId: string,
  image: Blob,
  caption: string,
  visibility: Visibility,
): Promise<void> {
  const sb = getSupabase();
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const up = await sb.storage.from("posts").upload(path, image, { contentType: "image/jpeg" });
  if (up.error) throw new Error(up.error.message);
  const ins = await sb
    .from("posts")
    .insert({ author: userId, image_path: path, caption: caption.trim(), visibility });
  if (ins.error) {
    // 게시물 행이 없으면 이미지는 쓸 곳이 없어서 정리해 둔다(실패해도 무시).
    await sb.storage.from("posts").remove([path]).catch(() => undefined);
    throw new Error(ins.error.message);
  }
}

export async function saveOrder(ids: string[]): Promise<void> {
  const res = await getSupabase().rpc("reorder_my_posts", { ids });
  if (res.error) throw new Error(res.error.message);
}
