"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { CAPTION_MAX, VISIBILITY_LABEL, createPost, type Visibility } from "@/lib/posts";

// 저장 탭의 "내 피드에 올리기". 합성이 끝난 이미지를 만드는 일은 부모(makeImage)가 한다.
export default function PublishPanel({ makeImage }: { makeImage: () => Promise<Blob> }) {
  const { status, user, configured } = useAuth();
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!configured) return null;
  if (status !== "in" || !user) {
    return (
      <p className="text-xs text-zinc-500">
        내 피드에 올리려면 <Link href="/login" className="underline">로그인</Link>이 필요해요.
      </p>
    );
  }

  async function publish() {
    if (!user || !visibility) return;
    setBusy(true);
    setError(null);
    try {
      await createPost(user.id, await makeImage(), caption, visibility);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm">
        올렸어요. <Link href="/feed" className="underline">내 피드에서 보기</Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <span className="font-medium">내 피드에 올리기</span>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
        placeholder="한 줄 메모 (선택)"
        rows={2}
        className="rounded-lg border p-2"
      />
      <div className="flex items-center gap-2" role="radiogroup" aria-label="공개 범위">
        <span className="w-16">공개 범위</span>
        {(Object.keys(VISIBILITY_LABEL) as Visibility[]).map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={visibility === v}
            onClick={() => setVisibility(v)}
            className={`rounded-full border px-3 py-1 ${
              visibility === v ? "border-pink-500 bg-pink-50 text-pink-600" : ""
            }`}
          >
            {VISIBILITY_LABEL[v]}
          </button>
        ))}
      </div>
      <button
        onClick={publish}
        disabled={busy || !visibility}
        className="rounded-full border border-pink-500 py-2 font-medium text-pink-600 disabled:opacity-50"
      >
        {busy ? "올리는 중..." : visibility ? "올리기" : "공개 범위를 골라 주세요"}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
