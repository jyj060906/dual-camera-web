"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

const TIMEOUT_MS = 8000;

// 구글에서 돌아오는 곳. Supabase 클라이언트가 주소의 code를 읽어 로그인을 마무리한다.
export default function AuthCallback() {
  const router = useRouter();
  const { status, profile } = useAuth();
  const [urlError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return p.get("error_description") ?? p.get("error");
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (status !== "in" || !profile) return;
    // 아이디가 없는 새 사람은 아이디부터 만들게 한다.
    router.replace(profile.username ? "/" : "/profile");
  }, [status, profile, router]);

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
        <Link href="/login" className="rounded-none border py-2 text-center">
          다시 시도하기
        </Link>
      </div>
    );
  }
  return <p className="text-sm text-zinc-500">로그인을 마무리하는 중...</p>;
}
