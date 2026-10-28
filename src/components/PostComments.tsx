"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { COMMENT_MAX, addComment, deleteComment, editComment, loadComments, type Comment } from "@/lib/reactions";

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// 게시물 하나의 댓글: 보기, 쓰기, 내 댓글 수정·삭제.
export default function PostComments({
  postId,
  userId,
  onCount,
}: {
  postId: string;
  userId: string;
  onCount: (postId: string, n: number) => void; // 바뀌지 않는 함수여야 한다(아래 refresh의 의존성)
}) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await loadComments(postId);
      setList(rows);
      onCount(postId, rows.length);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [postId, onCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function run(job: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await job();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
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

  return (
    <div className="mt-2 flex flex-col text-sm">
      {list === null && !error && <p style={{ color: "#555555" }}>불러오는 중...</p>}
      {list?.length === 0 && <p style={{ color: "#555555" }}>아직 댓글이 없어요.</p>}
      <ul>
        {list?.map((c) => {
          const mine = c.author === userId;
          const isEditing = editing?.id === c.id;
          return (
            <li key={c.id} className="border-t py-2" style={{ borderColor: "#E2E2E2" }}>
              <div className="flex items-baseline justify-between gap-2 text-xs" style={{ color: "#555555" }}>
                <span className="truncate font-medium text-black">{c.authorName}</span>
                <span className="flex-none">
                  {fmt(c.created_at)}
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
                    <button type="button" onClick={() => setEditing(null)} className="border px-3 py-1">
                      취소
                    </button>
                    <button type="submit" disabled={busy || !editing.text.trim()} className="bg-black px-3 py-1 text-white disabled:opacity-50">
                      저장
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                  {mine && (
                    <div className="mt-1 flex gap-3 text-xs" style={{ color: "#555555" }}>
                      <button onClick={() => setEditing({ id: c.id, text: c.body })} className="underline">
                        수정
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm("댓글을 삭제할까요? 삭제한 내용은 기록으로 보관돼요.")) return;
                          void run(() => deleteComment(c.id));
                        }}
                        className="underline"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <form onSubmit={submit} className="flex items-center gap-3 border-t pt-2" style={{ borderColor: "#E2E2E2" }}>
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
          className="h-11 min-w-0 flex-1 border-0 border-b bg-transparent px-0 outline-none focus:border-b-2"
        />
        <button type="submit" disabled={busy || !text.trim()} className="h-11 bg-black px-4 text-white disabled:opacity-40">
          등록
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
