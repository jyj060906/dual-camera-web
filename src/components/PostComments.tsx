"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMMENT_MAX,
  addComment,
  commentErrorText,
  deleteComment,
  editComment,
  loadComments,
  type Comment,
} from "@/lib/reactions";
import Avatar from "./Avatar";
import { useMounted } from "@/lib/useMounted";

// "3분 전" 같은 상대 시간
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "방금";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  const dt = new Date(iso);
  return `${dt.getMonth() + 1}.${dt.getDate()}`;
}

// 키보드가 올라오면 그만큼 시트를 위로 올려 입력창이 가려지지 않게 한다(visualViewport 기준).
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

// 게시물 하나의 댓글을 보여 주는 바텀시트. 아래에서 올라오고, 입력창은 아래에 고정된다.
export default function PostComments({
  postId,
  userId,
  onCount,
  onClose,
}: {
  postId: string;
  userId: string;
  onCount: (postId: string, n: number) => void; // 바뀌지 않는 함수여야 한다(아래 refresh의 의존성)
  onClose: () => void;
}) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false); // 올라오는 애니메이션용
  const listRef = useRef<HTMLUListElement>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inset = useKeyboardInset();
  const mounted = useMounted();

  const refresh = useCallback(async () => {
    try {
      const rows = await loadComments(postId);
      setList(rows);
      onCount(postId, rows.length);
    } catch (e) {
      setList((cur) => cur ?? []);
      setError(commentErrorText(e));
    }
  }, [postId, onCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [refresh, onClose]);

  // 새 댓글이 생기면 맨 아래로 내린다.
  const count = list?.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  async function run(job: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await job();
      await refresh();
    } catch (e) {
      setError(commentErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    void run(async () => {
      await addComment(postId, userId, text);
      setText("");
    });
  };

  // 내 댓글을 길게 누르면(0.5초) 메뉴가 열린다.
  const startPress = (id: string) => {
    press.current = setTimeout(() => setMenuFor(id), 500);
  };
  const endPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="댓글">
      <button
        aria-label="댓글 닫기"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-x-0 mx-auto flex max-h-[75dvh] w-full max-w-xl flex-col border-t border-black bg-white transition-transform duration-200 ease-out ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ bottom: inset }}
      >
        <div className="flex h-12 flex-none items-center justify-between border-b border-black px-4">
          <span className="font-medium">댓글 {count > 0 && count}</span>
          <button onClick={onClose} aria-label="닫기" className="flex h-11 w-11 items-center justify-center text-lg">
            ✕
          </button>
        </div>

        <ul ref={listRef} className="min-h-[30dvh] flex-1 overflow-y-auto overscroll-contain px-4 py-2 text-sm">
          {list === null && <li style={{ color: "#555555" }}>불러오는 중...</li>}
          {list?.length === 0 && (
            <li className="py-10 text-center" style={{ color: "#555555" }}>
              첫 댓글을 남겨보세요
            </li>
          )}
          {list?.map((c) => {
            const mine = c.user_id === userId;
            const isEditing = editing?.id === c.id;
            return (
              <li
                key={c.id}
                className="relative flex gap-3 py-2"
                onPointerDown={mine && !isEditing ? () => startPress(c.id) : undefined}
                onPointerUp={endPress}
                onPointerLeave={endPress}
                onPointerCancel={endPress}
                onContextMenu={mine ? (e) => e.preventDefault() : undefined}
              >
                <Avatar person={{ nickname: c.authorName, username: null, avatar_url: c.avatar_url }} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-xs" style={{ color: "#555555" }}>
                    <span className="truncate font-medium text-black">{c.authorName}</span>
                    <span className="flex-none">
                      {mounted ? timeAgo(c.created_at) : ""}
                      {c.updated_at !== c.created_at && " · 수정됨"}
                    </span>
                  </div>
                  {isEditing ? (
                    <form
                      className="mt-1 flex flex-col gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!editing.text.trim() || busy) return;
                        void run(async () => {
                          await editComment(c.id, editing.text);
                          setEditing(null);
                        });
                      }}
                    >
                      <textarea
                        autoFocus
                        value={editing.text}
                        maxLength={COMMENT_MAX}
                        rows={2}
                        aria-label="댓글 수정"
                        onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                        className="w-full resize-none border p-2"
                      />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditing(null)} className="h-9 border px-3">
                          취소
                        </button>
                        <button type="submit" disabled={busy || !editing.text.trim()} className="h-9 bg-black px-3 text-white disabled:bg-[#767676]">
                          저장
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="mt-0.5 select-none whitespace-pre-wrap break-words">{c.content}</p>
                  )}
                </div>
                {mine && !isEditing && (
                  <button
                    onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                    aria-label="내 댓글 메뉴"
                    className="flex h-9 w-9 flex-none items-center justify-center text-lg leading-none"
                  >
                    ⋯
                  </button>
                )}
                {menuFor === c.id && (
                  <div className="absolute right-0 top-10 z-10 flex flex-col border border-black bg-white text-sm">
                    <button
                      className="h-11 px-5 text-left"
                      onClick={() => {
                        setMenuFor(null);
                        setEditing({ id: c.id, text: c.content });
                      }}
                    >
                      수정
                    </button>
                    <button
                      className="h-11 border-t border-black px-5 text-left"
                      disabled={busy}
                      onClick={() => {
                        setMenuFor(null);
                        if (!window.confirm("댓글을 삭제할까요?")) return;
                        void run(() => deleteComment(c.id));
                      }}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="flex-none px-4 pb-1 text-xs" style={{ color: "#555555" }}>
            {error}
          </p>
        )}
        <form
          onSubmit={submit}
          className="flex flex-none items-center gap-3 border-t border-black bg-white px-4 pt-2"
          style={{ paddingBottom: inset > 0 ? 8 : "max(8px, env(safe-area-inset-bottom))" }}
        >
          <label className="sr-only" htmlFor={`cmt-${postId}`}>
            댓글
          </label>
          <input
            id={`cmt-${postId}`}
            value={text}
            maxLength={COMMENT_MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder="댓글 달기"
            autoComplete="off"
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 border-0 border-b border-black bg-transparent px-0 text-base outline-none"
          />
          <button type="submit" disabled={busy || !text.trim()} className="h-11 bg-black px-4 text-white disabled:bg-[#767676]">
            게시
          </button>
        </form>
      </div>
    </div>
  );
}
