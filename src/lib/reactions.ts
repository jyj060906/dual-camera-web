import { getSupabase } from "./supabase";

export const COMMENT_MAX = 500;

export type LikeState = { count: number; mine: boolean };

export type Comment = {
  id: string;
  post_id: string;
  author: string;
  body: string;
  created_at: string;
  updated_at: string;
  authorName: string;
};

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// 게시물마다 좋아요 수와 내가 눌렀는지를 가져온다.
export async function loadLikes(postIds: string[], userId: string): Promise<Record<string, LikeState>> {
  const out: Record<string, LikeState> = Object.fromEntries(postIds.map((id) => [id, { count: 0, mine: false }]));
  if (postIds.length === 0) return out;
  const rows = must(await getSupabase().from("post_likes").select("post_id, user_id").in("post_id", postIds));
  for (const r of rows) {
    const s = out[r.post_id];
    if (!s) continue;
    s.count += 1;
    if (r.user_id === userId) s.mine = true;
  }
  return out;
}

// liked=true이면 좋아요를 등록하고, false이면 취소한다.
export async function setLike(postId: string, userId: string, liked: boolean): Promise<void> {
  const sb = getSupabase();
  if (liked) {
    const res = await sb.from("post_likes").insert({ post_id: postId, user_id: userId });
    // 이미 눌러져 있었다면(다른 기기 등) 원하는 상태가 된 것이다.
    if (res.error && res.error.code !== "23505") throw new Error(res.error.message);
  } else {
    const res = await sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
    if (res.error) throw new Error(res.error.message);
  }
}

export async function loadCommentCounts(postIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = Object.fromEntries(postIds.map((id) => [id, 0]));
  if (postIds.length === 0) return out;
  const rows = must(
    await getSupabase().from("post_comments").select("post_id").in("post_id", postIds).is("deleted_at", null),
  );
  for (const r of rows) out[r.post_id] = (out[r.post_id] ?? 0) + 1;
  return out;
}

// 삭제한 댓글(deleted_at이 찬 것)은 기록으로만 남고 화면에는 나오지 않는다.
export async function loadComments(postId: string): Promise<Comment[]> {
  const rows = must(
    await getSupabase()
      .from("post_comments")
      .select("id, post_id, author, body, created_at, updated_at, profile:profiles!post_comments_author_fkey(username, nickname)")
      .eq("post_id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  );
  return rows.map((r) => {
    const profile = (Array.isArray(r.profile) ? r.profile[0] : r.profile) as
      | { username: string | null; nickname: string }
      | null;
    return {
      id: r.id,
      post_id: r.post_id,
      author: r.author,
      body: r.body,
      created_at: r.created_at,
      updated_at: r.updated_at,
      authorName: profile?.username ? `@${profile.username}` : profile?.nickname || "알 수 없음",
    };
  });
}

export async function addComment(postId: string, userId: string, body: string): Promise<void> {
  const res = await getSupabase().from("post_comments").insert({ post_id: postId, author: userId, body: body.trim() });
  if (res.error) throw new Error(res.error.message);
}

export async function editComment(id: string, body: string): Promise<void> {
  const res = await getSupabase().from("post_comments").update({ body: body.trim() }).eq("id", id).select("id");
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error("수정할 수 없는 댓글이에요.");
}

// 행을 지우지 않고 deleted_at만 채운다(내용은 기록으로 남는다). 시각은 서버가 정한다.
export async function deleteComment(id: string): Promise<void> {
  const res = await getSupabase()
    .from("post_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error("삭제할 수 없는 댓글이에요.");
}
