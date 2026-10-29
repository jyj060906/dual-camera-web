"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { deletePost, type Post } from "@/lib/posts";
import { loadCommentCounts, loadLikes, setLike, type LikeState } from "@/lib/reactions";
import Avatar, { displayName } from "./Avatar";
import PostComments from "./PostComments";
import PostMenu from "./PostMenu";
import { useMounted } from "@/lib/useMounted";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 20.5C5 15.3 3 12 3 8.8 3 6.2 5 4.5 7.3 4.5c1.9 0 3.7 1.1 4.7 2.9 1-1.8 2.8-2.9 4.7-2.9C19 4.5 21 6.2 21 8.8c0 3.2-2 6.5-9 11.7Z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.1-4.3A8.5 8.5 0 1 1 20.5 12Z" />
    </svg>
  );
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

// 사진을 크게 보는 전체 화면. 눌렀던 사진에서 시작하고, 위아래로 스크롤하거나 스와이프하면
// 피드의 이전·다음 사진이 이어서 나온다(인스타그램의 게시물 보기처럼).
// inline이면 화면 전체 팝업이 아니라 페이지 안에 그대로 늘어놓는다(친구 피드). 이때는 닫기·시작 위치가 필요 없다.
export default function PostViewer({
  posts,
  startId,
  handle,
  onClose,
  onDeleted,
  inline = false,
}: {
  posts: Post[];
  startId?: string;
  handle?: string;
  onClose?: () => void;
  onDeleted?: (postId: string) => void; // 지운 뒤 부모가 자기 목록에서도 빼도록 알린다
  inline?: boolean;
}) {
  // 지운 게시물은 부모 목록이 바뀌기 전에도 바로 화면에서 뺀다.
  const mounted = useMounted();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [likes, setLikes] = useState<Record<string, LikeState>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  // 댓글 테이블이 아직 없는 등 댓글을 쓸 수 없으면 댓글 버튼을 숨기고, 서버 오류 문구는 화면에 내지 않는다.
  const [commentsDown, setCommentsDown] = useState(false);

  // 좋아요 수와 댓글 수는 한 번에 모아서 가져온다.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const ids = posts.map((p) => p.id);
    (async () => {
      const [l, c] = await Promise.allSettled([loadLikes(ids, userId), loadCommentCounts(ids)]);
      if (cancelled) return;
      if (l.status === "fulfilled") setLikes(l.value);
      if (c.status === "fulfilled") setCommentCounts(c.value);
      else setCommentsDown(true);
      if (l.status === "rejected") setReactionError("좋아요를 불러오지 못했어요.");
    })();
    return () => {
      cancelled = true;
    };
  }, [posts, userId]);

  const closeComments = useCallback(() => setOpenComments(null), []);
  const onCommentCount = useCallback((postId: string, n: number) => {
    setCommentCounts((c) => (c[postId] === n ? c : { ...c, [postId]: n }));
  }, []);

  // 누르는 즉시 화면에 반영하고, 서버에 실패하면 되돌린다.
  async function toggleLike(postId: string) {
    if (!userId) return;
    const cur = likes[postId] ?? { count: 0, mine: false };
    const next = { count: Math.max(0, cur.count + (cur.mine ? -1 : 1)), mine: !cur.mine };
    setLikes((l) => ({ ...l, [postId]: next }));
    setReactionError(null);
    try {
      await setLike(postId, userId, next.mine);
    } catch {
      setLikes((l) => ({ ...l, [postId]: cur }));
      setReactionError("좋아요를 처리하지 못했어요. 잠시 뒤 다시 해 주세요.");
    }
  }

  // 열릴 때 누른 사진 위치로 이동한다. 사진 칸은 3:4로 높이가 정해져 있어 이미지가 늦게 떠도 위치가 어긋나지 않는다.
  useEffect(() => {
    if (inline || !startId || !onClose) return;
    const el = scroller.current?.querySelector<HTMLElement>(`[data-post-id="${CSS.escape(startId)}"]`);
    el?.scrollIntoView({ block: "start" });
    closeBtn.current?.focus({ preventScroll: true });
    // 뒤쪽 피드가 같이 스크롤되지 않도록 잠근다.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // 처음 열릴 때만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function removePost(p: Post) {
    await deletePost(p);
    setRemoved((s) => new Set(s).add(p.id));
    setMenuFor(null);
    setOpenComments((cur) => (cur === p.id ? null : cur));
    onDeleted?.(p.id);
    setToast(true);
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const shownPosts = posts.filter((p) => !removed.has(p.id));
  const menuPost = menuFor ? posts.find((p) => p.id === menuFor) : undefined;

  const list = (
    <div className="mx-auto w-full max-w-xl">
      {menuPost && <PostMenu onClose={() => setMenuFor(null)} onDelete={() => removePost(menuPost)} />}
      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <span className="bg-black px-4 py-2 text-sm text-white">삭제되었어요</span>
        </div>
      )}
          {!commentsDown && openComments && userId && (
            <PostComments postId={openComments} userId={userId} onCount={onCommentCount} onClose={closeComments} />
          )}
          {shownPosts.map((p, i) => (
            <article key={p.id} data-post-id={p.id} className={inline ? "pb-6" : "snap-start pb-6"}>
              {p.author && (
                <div className="flex items-center pr-2">
                  <Link href={p.author.username ? `/u/${p.author.username}` : "/me"} className="flex min-w-0 flex-1 items-center gap-2 px-4 py-2">
                    <Avatar person={p.author} size={28} />
                    <span className="truncate text-sm font-medium">{displayName(p.author)}</span>
                  </Link>
                  {/* 내 게시물에만 보인다 */}
                  {userId && p.authorId === userId && (
                    <button onClick={() => setMenuFor(p.id)} aria-label="게시물 메뉴" aria-haspopup="dialog" className="flex h-11 w-11 flex-none items-center justify-center text-xl leading-none">
                      ⋯
                    </button>
                  )}
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imageUrl}
                alt={p.caption || "듀얼샷"}
                loading={inline ? (i < 2 ? "eager" : "lazy") : Math.abs(posts.findIndex((x) => x.id === startId) - i) <= 2 ? "eager" : "lazy"}
                className="aspect-[3/4] w-full bg-[#F2F2F2] object-cover"
              />
              <div className="flex flex-col gap-1 px-4 pt-2">
                {userId && (
                  <div className="-ml-2 flex items-center gap-1">
                    <button
                      onClick={() => void toggleLike(p.id)}
                      aria-pressed={likes[p.id]?.mine ?? false}
                      aria-label={likes[p.id]?.mine ? "좋아요 취소" : "좋아요"}
                      className="flex h-11 items-center gap-1.5 px-2"
                    >
                      <HeartIcon filled={likes[p.id]?.mine ?? false} />
                      <span className="text-sm">{likes[p.id]?.count ?? 0}</span>
                    </button>
                    {!commentsDown && (
                    <button
                      onClick={() => setOpenComments((cur) => (cur === p.id ? null : p.id))}
                      aria-haspopup="dialog"
                      aria-label="댓글"
                      className="flex h-11 items-center gap-1.5 px-2"
                    >
                      <CommentIcon />
                      <span className="text-sm">{commentCounts[p.id] ?? 0}</span>
                    </button>
                    )}
                  </div>
                )}
                <div className="text-xs" style={{ color: "#555555" }}>
                  {mounted ? fmtDate(p.created_at) : ""}
                </div>
                {p.caption && <p className="whitespace-pre-wrap text-base leading-relaxed">{p.caption}</p>}
              </div>
            </article>
          ))}
    </div>
  );

  if (inline) {
    return (
      <>
        {reactionError && (
          <p role="alert" className="mx-auto w-full max-w-xl px-4 py-2 text-xs text-red-600">
            {reactionError}
          </p>
        )}
        {list}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="게시물">
      <div className="mx-auto flex w-full max-w-xl flex-none items-center justify-between border-b px-2">
        <button ref={closeBtn} onClick={onClose} aria-label="닫기" className="h-11 px-3 text-[15px]">
          ← 닫기
        </button>
        <span className="truncate px-3 font-medium">{handle}</span>
      </div>

      {reactionError && (
        <p role="alert" className="mx-auto w-full max-w-xl flex-none px-4 py-2 text-xs text-red-600">
          {reactionError}
        </p>
      )}

      <div ref={scroller} className="flex-1 snap-y snap-proximity overflow-y-auto overscroll-contain">
        {list}
      </div>
    </div>
  );
}
