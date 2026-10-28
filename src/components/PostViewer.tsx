"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { VISIBILITY_LABEL, type Post } from "@/lib/posts";
import { loadCommentCounts, loadLikes, setLike, type LikeState } from "@/lib/reactions";
import PostComments from "./PostComments";

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
export default function PostViewer({
  posts,
  startId,
  handle,
  onClose,
}: {
  posts: Post[];
  startId: string;
  handle: string;
  onClose: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [likes, setLikes] = useState<Record<string, LikeState>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);

  // 좋아요 수와 댓글 수는 한 번에 모아서 가져온다.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const ids = posts.map((p) => p.id);
    (async () => {
      try {
        const [l, c] = await Promise.all([loadLikes(ids, userId), loadCommentCounts(ids)]);
        if (cancelled) return;
        setLikes(l);
        setCommentCounts(c);
      } catch (e) {
        if (!cancelled) setReactionError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [posts, userId]);

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
    } catch (e) {
      setLikes((l) => ({ ...l, [postId]: cur }));
      setReactionError(errorMessage(e));
    }
  }

  // 열릴 때 누른 사진 위치로 이동한다. 사진 칸은 3:4로 높이가 정해져 있어 이미지가 늦게 떠도 위치가 어긋나지 않는다.
  useEffect(() => {
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
        <div className="mx-auto w-full max-w-xl">
          {posts.map((p, i) => (
            <article key={p.id} data-post-id={p.id} className="snap-start pb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imageUrl}
                alt={p.caption || "듀얼샷"}
                loading={Math.abs(posts.findIndex((x) => x.id === startId) - i) <= 2 ? "eager" : "lazy"}
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
                    <button
                      onClick={() => setOpenComments((cur) => (cur === p.id ? null : p.id))}
                      aria-expanded={openComments === p.id}
                      aria-label="댓글"
                      className="flex h-11 items-center gap-1.5 px-2"
                    >
                      <CommentIcon />
                      <span className="text-sm">{commentCounts[p.id] ?? 0}</span>
                    </button>
                  </div>
                )}
                <div className="flex items-baseline justify-between text-xs" style={{ color: "#555555" }}>
                  <span>{fmtDate(p.created_at)}</span>
                  <span>
                    {VISIBILITY_LABEL[p.visibility]} · {i + 1}/{posts.length}
                  </span>
                </div>
                {p.caption && <p className="whitespace-pre-wrap text-base leading-relaxed">{p.caption}</p>}
                {openComments === p.id && userId && (
                  <PostComments postId={p.id} userId={userId} onCount={onCommentCount} />
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
