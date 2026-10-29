"use client";

import { useEffect, useState } from "react";

// 게시물의 ⋯ 메뉴: 아래에서 올라오는 메뉴 → 삭제 확인창. 지우는 일 자체는 부모(onDelete)가 한다.
export default function PostMenu({
  onClose,
  onDelete,
}: {
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [shown, setShown] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, busy]);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await onDelete(); // 성공하면 부모가 이 메뉴를 닫는다
    } catch {
      setError("삭제하지 못했어요");
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8" role="alertdialog" aria-modal="true" aria-label="게시물 삭제 확인">
        <div className="w-full max-w-xs border border-black bg-white">
          <div className="flex flex-col gap-1 px-5 py-6 text-center">
            <p className="font-medium">게시물을 삭제할까요?</p>
            <p className="text-sm" style={{ color: "#555555" }}>
              삭제하면 되돌릴 수 없어요.
            </p>
            {error && (
              <p role="alert" className="pt-2 text-xs" style={{ color: "#555555" }}>
                {error}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 border-t border-black">
            <button onClick={onClose} disabled={busy} className="h-12">
              취소
            </button>
            <button onClick={() => void remove()} disabled={busy} className="h-12 border-l border-black font-medium disabled:opacity-50" style={{ color: "#D00000" }}>
              {busy ? "삭제 중..." : "삭제"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="게시물 메뉴">
      <button
        aria-label="메뉴 닫기"
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl border-t border-black bg-white pb-[env(safe-area-inset-bottom)] transition-transform duration-200 ease-out ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <button onClick={() => setConfirming(true)} className="h-14 w-full text-[15px] font-medium" style={{ color: "#D00000" }}>
          삭제
        </button>
        <button onClick={onClose} className="h-14 w-full border-t border-black text-[15px]">
          취소
        </button>
      </div>
    </div>
  );
}
