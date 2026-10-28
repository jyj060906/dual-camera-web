"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { listPostsBy, saveOrder, type Post } from "@/lib/posts";
import { displayName } from "./Avatar";
import PostViewer from "./PostViewer";
import RequireLogin from "./RequireLogin";

// 내 피드: feed-app 시안의 흑백 미니멀. 듀얼샷이 촘촘히 붙고 그리드/번호/스트립으로 볼 수 있다.
const INK = "#000000";
const GRAY = "#555555";
const serif = {};
const numeric = {};

type ViewMode = "grid" | "num" | "strip";
const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "grid", label: "그리드" },
  { id: "num", label: "번호" },
  { id: "strip", label: "스트립" },
];
const pad2 = (n: number) => String(n).padStart(2, "0");

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

function Inner() {
  const { profile, user } = useAuth();
  const userId = user?.id ?? null;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState<Post | null>(null);
  const [mode, setMode] = useState<ViewMode>("grid");

  // 배치 편집 상태: draft가 null이 아니면 편집 중
  const [draft, setDraft] = useState<Post[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 드래그 중에는 DOM 순서를 그대로 두고 CSS order로만 자리를 바꾼다.
  // (DOM 노드가 옮겨지면 브라우저가 포인터 캡처를 풀어서 드래그가 끊긴다.)
  const [dragBase, setDragBase] = useState<string[] | null>(null);
  const pointerY = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!userId) return;
        const list = await listPostsBy(userId);
        if (!cancelled) setPosts(list);
      } catch (e) {
        if (!cancelled) setLoadError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 드래그 중 화면 가장자리에 가까워지면 스크롤한다(모바일에서 멀리 옮길 때 필요).
  useEffect(() => {
    if (!dragging) return;
    let raf = 0;
    const tick = () => {
      const y = pointerY.current;
      const edge = 90;
      if (y < edge) window.scrollBy(0, -Math.ceil((edge - y) / 6));
      else if (y > window.innerHeight - edge) window.scrollBy(0, Math.ceil((y - (window.innerHeight - edge)) / 6));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragging]);

  const closeViewer = useCallback(() => setOpen(null), []);

  if (loadError) return <p className="p-4 text-sm text-red-600">{loadError}</p>;
  if (!posts) return <p className="p-4 text-sm" style={{ color: INK }}>불러오는 중...</p>;

  const editing = draft !== null;
  const list = draft ?? posts;
  const changed = editing && draft.some((p, i) => p.id !== posts[i]?.id);

  function startEdit() {
    setDraft(posts);
    setSelected(null);
    setSaveError(null);
  }
  function cancelEdit() {
    setDraft(null);
    setDragBase(null);
    setSelected(null);
    setDragging(null);
  }
  async function commit() {
    if (!draft) return;
    if (!changed) return cancelEdit();
    setSaving(true);
    setSaveError(null);
    try {
      await saveOrder(draft.map((p) => p.id));
      setPosts(draft);
      cancelEdit();
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // 손잡이를 잡았을 때만 드래그한다. 셀의 나머지 부분은 평소처럼 스크롤된다.
  function onHandleDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerY.current = e.clientY;
    setDragBase(draft?.map((p) => p.id) ?? null);
    setDragging(id);
    setSelected(id);
  }
  function onHandleMove(e: React.PointerEvent) {
    if (!dragging) return;
    pointerY.current = e.clientY;
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-post-id]")?.dataset.postId;
    if (!target || target === dragging) return;
    setDraft((d) => {
      if (!d) return d;
      return move(d, d.findIndex((p) => p.id === dragging), d.findIndex((p) => p.id === target));
    });
  }
  const onHandleUp = () => {
    setDragging(null);
    setDragBase(null);
  };

  const selectedIndex = selected && draft ? draft.findIndex((p) => p.id === selected) : -1;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#FFFFFF", color: INK }}>
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col">
      <header className="px-5 pt-4">
        <div className="flex items-center justify-between gap-3 text-[15px]">
          <Link href="/" className="min-h-11 content-center">
            ← 사진 만들기
          </Link>
          <span className="flex min-w-0 items-center gap-3">
            <span className="truncate font-medium">{profile?.username ? `@${profile.username}` : ""}</span>
            {!editing && (
              <Link href="/profile" className="flex-none border px-3 py-1 text-sm" style={{ borderColor: INK }}>
                프로필 수정
              </Link>
            )}
          </span>
        </div>
        <h1 className="mt-2 break-words text-[56px] font-medium leading-[0.92] tracking-[-1.5px] sm:text-[64px]">
          {displayName(profile ?? { nickname: "", username: null })}
          <br />
          feed
        </h1>
        {profile?.bio && <p className="mt-2 text-[13px]" style={{ color: GRAY }}>{profile.bio.replace(/\s+/g, " ")}</p>}
        <div className="mt-3 flex items-baseline justify-between text-[15px]">
          <span>© {new Date().getFullYear()}</span>
          <span className="flex items-baseline gap-3" aria-label={`게시물 ${posts.length}개`}>
            {posts.length} posts
            {!editing && posts.length > 1 && (
              <button onClick={startEdit} className="border px-3 py-1 text-sm" style={{ borderColor: INK }}>
                정리
              </button>
            )}
          </span>
        </div>
      </header>

      {!editing && posts.length > 0 && (
        <nav className="mx-5 mt-3 flex gap-5 border-y" aria-label="보기 방식">
          {VIEW_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`h-11 text-base underline-offset-[5px] ${mode === m.id ? "underline" : ""}`}
              style={{ color: mode === m.id ? INK : "#767676" }}
            >
              {m.label}
            </button>
          ))}
        </nav>
      )}

      {posts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm">
          <p style={serif}>아직 올린 사진이 없어요.</p>
          <Link href="/" className="border px-4 py-2" style={{ borderColor: INK }}>
            듀얼샷 만들러 가기
          </Link>
        </div>
      ) : !editing && mode === "num" ? (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-5 pb-6 pt-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {posts.map((p, i) => (
            <li key={p.id}>
              <button onClick={() => setOpen(p)} className="flex w-full flex-col gap-1.5 text-left text-[13px]" aria-label={`${pad2(i + 1)}번 게시물 열기`}>
                <span>({pad2(i + 1)})</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt={p.caption || "듀얼샷"} className="aspect-[3/4] w-full bg-[#F2F2F2] object-cover" />
                {p.caption && <span className="truncate" style={{ color: GRAY }}>{p.caption}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : !editing && mode === "strip" ? (
        <ul className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-6 pt-1">
          {posts.map((p, i) => (
            <li key={p.id} className="border-b" style={{ borderColor: "#E2E2E2" }}>
              <button onClick={() => setOpen(p)} className="flex w-full items-start gap-3 py-2.5 text-left text-sm" aria-label={`${pad2(i + 1)}번 게시물 열기`}>
                <span className="w-7 flex-none text-[13px]">{pad2(i + 1)}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt={p.caption || "듀얼샷"} className="aspect-[3/4] w-[120px] flex-none bg-[#F2F2F2] object-cover" />
                <span className="min-w-0">
                  <span className="block truncate">{p.caption || " "}</span>
                  <span className="mt-1 block text-xs" style={{ color: GRAY }}>{fmtDate(p.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul
          className={`grid ${
            editing
              ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          } items-start`}
          style={{ gap: 3, paddingBottom: editing ? 150 : 24 }}
        >
          {(dragBase && draft
            ? dragBase.map((id) => draft.find((p) => p.id === id)!)
            : list
          ).map((p) => {
            const i = list.findIndex((x) => x.id === p.id);
            return (
            <li
              key={p.id}
              data-post-id={p.id}
              style={dragBase ? { order: i } : undefined}
              className={dragging === p.id ? "z-10 opacity-70" : ""}
            >
              {editing ? (
                <div
                  onClick={() => setSelected(p.id)}
                  className="relative aspect-[3/4] overflow-hidden bg-[#F2F2F2]"
                  style={{ outline: selected === p.id ? `2px solid ${INK}` : "none", outlineOffset: -2 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt={p.caption || "듀얼샷"} draggable={false} className="h-full w-full object-cover" />
                  <span className="absolute left-1 top-1 bg-white px-1 text-[10px]" style={numeric}>
                    {i + 1}
                  </span>
                  <button
                    aria-label={`${i + 1}번째 사진 끌어서 옮기기`}
                    onPointerDown={(e) => onHandleDown(e, p.id)}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onPointerCancel={onHandleUp}
                    className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center bg-white text-lg"
                    style={{ touchAction: "none", cursor: "grab" }}
                  >
                    ⠿
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => setOpen(p)} className="block w-full" aria-label={`${fmtDate(p.created_at)} 게시물 열기`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt={p.caption || "듀얼샷"} className="aspect-[3/4] w-full bg-[#F2F2F2] object-cover" />
                  </button>
                </>
              )}
            </li>
            );
          })}
        </ul>
      )}

      </div>

      {editing && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t p-3 text-sm" style={{ background: "#FFFFFF", borderColor: INK }}>
          <fieldset disabled className="flex items-center gap-2 text-xs opacity-70">
            <legend className="sr-only">순서 적용 범위</legend>
            <span>적용 범위</span>
            <label className="flex items-center gap-1"><input type="radio" disabled /> 내 피드만</label>
            <label className="flex items-center gap-1"><input type="radio" disabled /> 홈 피드도</label>
            <span>· 아직 정해지지 않았어요. 지금은 내 피드에만 쓰여요.</span>
          </fieldset>
          <div className="flex items-center gap-2">
            {selectedIndex >= 0 && draft ? (
              <>
                <span className="text-xs">{selectedIndex + 1}번째</span>
                <button
                  className="border px-2 py-1 disabled:opacity-40"
                  style={{ borderColor: INK }}
                  disabled={selectedIndex === 0}
                  onClick={() => setDraft((d) => d && move(d, selectedIndex, selectedIndex - 1))}
                >
                  ← 앞으로
                </button>
                <button
                  className="border px-2 py-1 disabled:opacity-40"
                  style={{ borderColor: INK }}
                  disabled={selectedIndex === draft.length - 1}
                  onClick={() => setDraft((d) => d && move(d, selectedIndex, selectedIndex + 1))}
                >
                  뒤로 →
                </button>
                <label className="flex items-center gap-1 text-xs">
                  번호로
                  <input
                    type="number"
                    min={1}
                    max={draft.length}
                    value={selectedIndex + 1}
                    onChange={(e) => {
                      const n = Math.min(draft.length, Math.max(1, Number(e.target.value) || 1));
                      setDraft((d) => d && move(d, selectedIndex, n - 1));
                    }}
                    className="w-14 border bg-transparent px-1 py-1"
                    style={{ borderColor: INK }}
                  />
                </label>
              </>
            ) : (
              <span className="text-xs">사진을 눌러 고르거나 ⠿를 끌어서 옮겨요.</span>
            )}
          </div>
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          <div className="flex gap-2">
            <button onClick={cancelEdit} disabled={saving} className="flex-1 border py-2" style={{ borderColor: INK }}>
              취소
            </button>
            <button
              onClick={commit}
              disabled={saving}
              className="flex-1 py-2 text-white disabled:opacity-60"
              style={{ background: INK }}
            >
              {saving ? "저장하는 중..." : changed ? "순서 저장" : "완료"}
            </button>
          </div>
        </div>
      )}

      {open && (
        <PostViewer
          posts={posts}
          startId={open.id}
          handle={profile?.username ? `@${profile.username}` : displayName(profile ?? { nickname: "", username: null })}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}

export default function FeedView() {
  return (
    <RequireLogin>
      <Inner />
    </RequireLogin>
  );
}
