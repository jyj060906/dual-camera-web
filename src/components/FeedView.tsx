"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { VISIBILITY_LABEL, listMyPosts, saveOrder, type Post } from "@/lib/posts";
import { displayName } from "./Avatar";
import RequireLogin from "./RequireLogin";

// 내 피드: 필름 시트처럼 듀얼샷이 촘촘히 붙는 화면.
// 색과 글꼴은 이 화면 안에서만 쓴다(사진 색을 해치지 않는 따뜻한 중성 배경).
const INK = "#1B1B1B";
const ACCENT = "#E8552D";
const serif = { fontFamily: "var(--font-noto-serif-kr), serif" };
const numeric = { fontFamily: "var(--font-playfair), serif" };

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
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState<Post | null>(null);

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
        const list = await listMyPosts();
        if (!cancelled) setPosts(list);
      } catch (e) {
        if (!cancelled) setLoadError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const closeSheet = useCallback(() => setOpen(null), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSheet();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeSheet]);

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
    <div className="flex min-h-screen flex-col" style={{ background: "#F3F1EC", color: INK }}>
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col">
      <header className="flex items-end justify-between gap-3 px-3 pb-3 pt-4">
        <div className="min-w-0">
          <Link href="/" className="text-xs underline-offset-2 hover:underline" style={{ color: "#6b675f" }}>
            ← 사진 만들기
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold leading-tight" style={serif}>
            {profile?.username ? `@${profile.username}` : displayName(profile ?? { nickname: "", username: null })}
          </h1>
          <p className="truncate text-xs" style={{ ...serif, color: "#6b675f" }}>
            {profile?.nickname}
            {profile?.bio ? ` · ${profile.bio.replace(/\s+/g, " ")}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-end gap-3">
          <span className="text-sm" style={numeric} aria-label={`게시물 ${posts.length}개`}>
            {String(posts.length).padStart(2, "0")}
          </span>
          {!editing && posts.length > 1 && (
            <button onClick={startEdit} className="border px-3 py-1 text-sm" style={{ borderColor: INK }}>
              정리
            </button>
          )}
        </div>
      </header>

      {posts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm">
          <p style={serif}>아직 올린 사진이 없어요.</p>
          <Link href="/" className="border px-4 py-2" style={{ borderColor: INK }}>
            듀얼샷 만들러 가기
          </Link>
        </div>
      ) : (
        <ul
          className={`grid ${
            editing
              ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
              : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          } items-start`}
          style={{ gap: 3, paddingBottom: editing ? 150 : 24 }}
        >
          {!editing && profile && (
            <li>
              <Link href="/profile" aria-label="프로필 수정" className="relative block aspect-[3/4] overflow-hidden bg-[#E4E0D8]">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-5xl" style={serif}>
                    {displayName(profile).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="absolute bottom-1 left-1 bg-[#F3F1EC] px-1.5 py-0.5 text-[10px]">프로필</span>
              </Link>
            </li>
          )}
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
                  className="relative aspect-[3/4] overflow-hidden bg-[#E4E0D8]"
                  style={{ outline: selected === p.id ? `2px solid ${ACCENT}` : "none", outlineOffset: -2 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt={p.caption || "듀얼샷"} draggable={false} className="h-full w-full object-cover" />
                  <span className="absolute left-1 top-1 bg-[#F3F1EC] px-1 text-[10px]" style={numeric}>
                    {i + 1}
                  </span>
                  <button
                    aria-label={`${i + 1}번째 사진 끌어서 옮기기`}
                    onPointerDown={(e) => onHandleDown(e, p.id)}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onPointerCancel={onHandleUp}
                    className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center bg-[#F3F1EC] text-lg"
                    style={{ touchAction: "none", cursor: "grab" }}
                  >
                    ⠿
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => setOpen(p)} className="block w-full" aria-label={`${fmtDate(p.created_at)} 게시물 열기`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt={p.caption || "듀얼샷"} className="aspect-[3/4] w-full bg-[#E4E0D8] object-cover" />
                  </button>
                  <div className="px-1 pb-2 pt-1 text-[11px] leading-snug">
                    <span style={numeric}>{fmtDate(p.created_at)}</span>
                    {p.caption && (
                      <span className="block truncate" style={{ ...serif, color: "#6b675f" }}>
                        {p.caption}
                      </span>
                    )}
                  </div>
                </>
              )}
            </li>
            );
          })}
        </ul>
      )}

      </div>

      {editing && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t p-3 text-sm" style={{ background: "#F3F1EC", borderColor: INK }}>
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
              style={{ background: ACCENT }}
            >
              {saving ? "저장하는 중..." : changed ? "순서 저장" : "완료"}
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-30 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="게시물">
          <button aria-label="닫기" className="absolute inset-0 bg-black/50" onClick={closeSheet} />
          <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto" style={{ background: "#F3F1EC" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.imageUrl} alt={open.caption || "듀얼샷"} className="w-full" />
            <div className="flex flex-col gap-1 p-4">
              <div className="flex items-baseline justify-between text-xs" style={{ color: "#6b675f" }}>
                <span style={numeric}>{fmtDate(open.created_at)}</span>
                <span>{VISIBILITY_LABEL[open.visibility]}</span>
              </div>
              {open.caption && (
                <p className="whitespace-pre-wrap text-base leading-relaxed" style={serif}>
                  {open.caption}
                </p>
              )}
            </div>
            <button onClick={closeSheet} autoFocus className="sticky bottom-0 w-full border-t py-3 text-sm" style={{ background: "#F3F1EC", borderColor: INK }}>
              닫기
            </button>
          </div>
        </div>
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
