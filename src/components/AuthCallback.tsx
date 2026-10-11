"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

// 구글에서 돌아오는 곳. Supabase 클라이언트가 주소의 code를 읽어 로그인을 마무리한다.
export default function AuthCallback() {
  const router = useRouter();
  const { status, profile } = useAuth();
  const [error] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return p.get("error_description") ?? p.get("error");
  });

  useEffect(() => {
    if (status !== "in" || !profile) return;
    // 아이디가 없는 새 사람은 아이디부터 만들게 한다.
    router.replace(profile.username ? "/" : "/profile");
  }, [status, profile, router]);

  if (error) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-red-500">로그인하지 못했어요: {error}</p>
        <Link href="/login" className="rounded-full border py-2 text-center">
          다시 시도하기
        </Link>
      </div>
    );
  }
  return <p className="text-sm text-zinc-500">로그인을 마무리하는 중...</p>;
}
