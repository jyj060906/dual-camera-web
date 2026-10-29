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
  imagePath: string; // 저장소 안의 파일 경로(게시물을 지울 때 파일도 함께 지운다)
  authorId: string;
  imageUrl: string; // 잠깐 쓰는 서명된 주소(게시물 이미지는 비공개 저장소에 있다)
  author?: PostAuthor; // 친구 피드처럼 여러 사람의 글을 섞어 보여 줄 때만 채운다
};

export type PostAuthor = { id: string; username: string | null; nickname: string; avatar_url: string | null };

const SIGNED_SECONDS = 60 * 60;

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

type Row = {
  id: string;
  caption: string;
  visibility: string;
  created_at: string;
  image_path: string;
  author?: string;
  profile?: unknown;
};

// 행들에 서명된 이미지 주소를 붙여 화면에서 쓰는 모양으로 바꾼다.
async function toPosts(rows: Row[]): Promise<Post[]> {
  if (rows.length === 0) return [];
  const signed = must(
    await getSupabase().storage.from("posts").createSignedUrls(
      rows.map((r) => r.image_path),
      SIGNED_SECONDS,
    ),
  );
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => {
    const prof = (Array.isArray(r.profile) ? r.profile[0] : r.profile) as Omit<PostAuthor, "id"> | null | undefined;
    return {
      id: r.id,
      caption: r.caption,
      visibility: r.visibility as Visibility,
      created_at: r.created_at,
      imagePath: r.image_path,
      authorId: r.author ?? "",
      imageUrl: urlByPath.get(r.image_path) ?? "",
      author: r.author && prof ? { id: r.author, ...prof } : undefined,
    };
  });
}

// authorId 사용자의 게시물을 그 사람이 정한 순서대로 가져온다. 새 글은 맨 앞이다(기본 정렬은 확정 전의 임시 값).
// 반드시 author로 걸러야 한다: 다른 사람의 공개 게시물도 읽을 수 있게 되었기 때문에, 걸러내지 않으면 내 피드에 섞인다.
// 내 프로필이면 내 게시물 전부, 다른 사람이면 DB 규칙에 따라 볼 수 있는 것만 온다.
export async function listPostsBy(authorId: string): Promise<Post[]> {
  const rows = must(
    await getSupabase()
      .from("posts")
      .select("id, caption, visibility, created_at, image_path, author, profile:profiles!posts_author_fkey(username, nickname, avatar_url)")
      .eq("author", authorId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
  );
  return toPosts(rows as Row[]);
}

// 친구 피드: 내 글과, 서로 수락한 친구들의 글을 최신순으로 가져온다. 게시물을 올리지 않아도 볼 수 있다.
// 어떤 글이 보이는지는 DB 규칙이 정한다(친구공개·공개 계정의 공개 글. 비공개는 본인만).
export async function listFriendFeed(myId: string, limit = 60): Promise<Post[]> {
  const sb = getSupabase();
  const friends = must(await sb.from("friendships").select("requester, addressee").eq("status", "accepted"));
  const ids = new Set<string>([myId]);
  for (const f of friends) ids.add(f.requester === myId ? f.addressee : f.requester);
  const rows = must(
    await sb
      .from("posts")
      .select("id, caption, visibility, created_at, image_path, author, profile:profiles!posts_author_fkey(username, nickname, avatar_url)")
      .in("author", [...ids])
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  return toPosts(rows as Row[]);
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

// 내 게시물을 지운다. 행을 먼저 지우고(댓글·좋아요는 DB가 함께 지운다), 이미지 파일도 지운다.
// 파일 삭제가 실패해도 게시물은 이미 지워진 상태이므로 오류로 보지 않는다.
export async function deletePost(post: Pick<Post, "id" | "imagePath">): Promise<void> {
  const sb = getSupabase();
  const res = await sb.from("posts").delete().eq("id", post.id).select("id");
  if (res.error) {
    console.error("[deletePost] 게시물 삭제 실패:", res.error);
    throw new Error(res.error.message);
  }
  if (!res.data?.length) {
    // 오류 없이 0행이면 삭제 정책(RLS)이 없거나 내 게시물이 아닌 경우다.
    console.error("[deletePost] 삭제된 행이 없어요. posts의 DELETE 정책을 확인하세요:", post.id);
    throw new Error("삭제할 수 없는 게시물이에요.");
  }
  const rm = await sb.storage.from("posts").remove([post.imagePath]).catch((e) => ({ data: null, error: e }));
  // 정책이 없으면 오류 없이 0개가 지워진다.
  if (rm.error || !rm.data?.length) console.error("[deletePost] 이미지 파일이 지워지지 않았어요. 버킷 DELETE 정책을 확인하세요:", rm.error);
}

export async function saveOrder(ids: string[]): Promise<void> {
  const res = await getSupabase().rpc("reorder_my_posts", { ids });
  if (res.error) throw new Error(res.error.message);
}
