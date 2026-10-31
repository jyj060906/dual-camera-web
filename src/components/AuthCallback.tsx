"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const TIMEOUT_MS = 8000;

// NEXT_PUBLIC_* 값은 빌드 때 코드에 박힌다. 배포본이 어떤 값으로 빌드됐는지 보려고 앞뒤 일부와 길이만 보여 준다.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const maskKey = (k: string | undefined) =>
  k ? `${k.slice(0, 15)}…${k.slice(-5)} (${k.length}자${k !== k.trim() ? ", 앞뒤 공백 있음" : ""})` : "없음";

// 구글에서 돌아오는 곳. Supabase 클라이언트가 주소의 code를 읽어 로그인을 마무리한다.
export default function AuthCallback() {
  const router = useRouter();
  const { status, profile, configured } = useAuth();
  // 클라이언트가 code를 읽어 주소에서 지우기 전(첫 렌더)의 주소 상태를 기록한다. 값은 담지 않고 있고 없음만 남긴다.
  const [snapshot] = useState<{ error: string | null; diag: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const has = (v: boolean) => (v ? "있음" : "없음");
    return {
      error: q.get("error_description") ?? q.get("error") ?? h.get("error_description") ?? h.get("error"),
      diag: [
        `주소 code ${has(q.has("code"))}`,
        `해시 access_token ${has(h.has("access_token"))}`,
        `검증 쿠키 ${has(document.cookie.includes("code-verifier"))}`,
        `주소 ${window.location.origin}`,
        `빌드에 들어간 Supabase 주소 ${SUPABASE_URL ?? "없음"}`,
        `빌드에 들어간 키 ${maskKey(SUPABASE_KEY)}`,
      ].join(" · "),
    };
  });
  const urlError = snapshot?.error ?? null;
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (status !== "in" || !profile) return;
    // 아이디가 없는 새 사람은 아이디부터 만들게 한다.
    router.replace(profile.username ? "/" : "/profile");
  }, [status, profile, router]);

  // 로그인 정보가 없을 때, 클라이언트가 주소의 code를 교환하다 낸 오류가 있으면 화면에 보여 준다.
  // initialize()는 이미 끝난 초기화의 결과를 그대로 돌려줘서 다시 요청하지 않는다.
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  useEffect(() => {
    if (status !== "out" || !configured) return;
    let alive = true;
    getSupabase()
      .auth.initialize()
      .then(({ error: e }) => {
        if (alive && e) setExchangeError(`${e.name}${e.status ? ` ${e.status}` : ""}: ${e.message}`);
      });
    return () => {
      alive = false;
    };
  }, [status, configured]);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  // 클라이언트가 code를 읽으면 주소에서 지우므로, 주소에 오류가 없어도 교환이 실패했을 수 있다.
  const error =
    urlError ??
    (status === "out"
      ? "로그인 정보를 받지 못했어요. 로그인을 시작한 브라우저 탭에서 다시 시도해 주세요."
      : timedOut
        ? status === "in"
          ? "로그인은 됐지만 프로필을 불러오지 못했어요."
          : "로그인이 제때 끝나지 않았어요."
        : null);

  if (error) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-red-500">로그인하지 못했어요: {error}</p>
        {snapshot && <p className="break-all text-xs text-zinc-500">{snapshot.diag}</p>}
        {exchangeError && <p className="break-all text-xs text-zinc-500">교환 오류 {exchangeError}</p>}
        <Link href="/login" className="rounded-none border py-2 text-center">
          다시 시도하기
        </Link>
      </div>
    );
  }
  return <p className="text-sm text-zinc-500">로그인을 마무리하는 중...</p>;
}
