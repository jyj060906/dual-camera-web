import { getSupabase } from "./supabase";

export const COMMENT_MAX = 300;

export type LikeState = { count: number; mine: boolean };

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  authorName: string;
  avatar_url: string | null;
};

// 서버 오류 문구(테이블 없음, 스키마 캐시 등)를 화면에 그대로 내지 않고 쉬운 말로 바꾼다.
export function commentErrorText(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (/post_comments|schema cache|relation .* does not exist/i.test(m)) return "지금은 댓글을 쓸 수 없어요.";
  if (/row-level security|permission|42501/i.test(m)) return "이 게시물에는 댓글을 달 수 없어요.";
  return "댓글을 처리하지 못했어요. 잠시 뒤 다시 해 주세요.";
}

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
  const rows = must(await getSupabase().from("post_comments").select("post_id").in("post_id", postIds));
  for (const r of rows) out[r.post_id] = (out[r.post_id] ?? 0) + 1;
  return out;
}

// 오래된 순으로 가져온다.
export async function loadComments(postId: string): Promise<Comment[]> {
  const rows = must(
    await getSupabase()
      .from("post_comments")
      .select("id, post_id, user_id, content, created_at, updated_at, profile:profiles!post_comments_user_id_fkey(username, nickname, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
  );
  return rows.map((r) => {
    const profile = (Array.isArray(r.profile) ? r.profile[0] : r.profile) as
      | { username: string | null; nickname: string; avatar_url: string | null }
      | null;
    return {
      id: r.id,
      post_id: r.post_id,
      user_id: r.user_id,
      content: r.content,
      created_at: r.created_at,
      updated_at: r.updated_at,
      authorName: profile?.nickname || profile?.username || "알 수 없음",
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}

export async function addComment(postId: string, userId: string, content: string): Promise<void> {
  const res = await getSupabase().from("post_comments").insert({ post_id: postId, user_id: userId, content: content.trim() });
  if (res.error) throw new Error(res.error.message);
}

export async function editComment(id: string, content: string): Promise<void> {
  const res = await getSupabase().from("post_comments").update({ content: content.trim() }).eq("id", id).select("id");
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error("수정할 수 없는 댓글이에요.");
}

// 행을 완전히 지운다.
export async function deleteComment(id: string): Promise<void> {
  const res = await getSupabase().from("post_comments").delete().eq("id", id).select("id");
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error("삭제할 수 없는 댓글이에요.");
}

// 내 게시물에 다른 사람이 since(ISO 시각) 이후에 단 댓글 수. 하단 '나' 탭의 알림 점에 쓴다.
export async function countNewCommentsOnMine(userId: string, since: string): Promise<number> {
  const res = await getSupabase()
    .from("post_comments")
    .select("id, posts!inner(author)", { count: "exact", head: true })
    .eq("posts.author", userId)
    .neq("user_id", userId)
    .gt("created_at", since);
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}
