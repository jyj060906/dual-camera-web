"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import Avatar from "./Avatar";
import { UsersIcon } from "./icons";

// 화면 위쪽의 로그인·친구·내 프로필 바로가기
export default function AccountBar() {
  const { status, profile, configured } = useAuth();
  if (!configured) return null;
  if (status === "loading") return <span className="h-9 w-9" aria-hidden />;
  if (status === "out") {
    return (
      <Link href="/login" className="rounded-none border px-3 py-1 text-sm">
        로그인
      </Link>
    );
  }
  return (
    <nav className="flex items-center gap-2">
      <Link href="/feed" className="rounded-none border px-3 py-1 text-sm text-zinc-600">
        내 피드
      </Link>
      <Link href="/friends" aria-label="친구" title="친구" className="rounded-none p-2 text-zinc-600">
        <UsersIcon className="h-5 w-5" />
      </Link>
      <Link href="/profile" aria-label="내 프로필" title="내 프로필">
        {profile ? (
          <Avatar person={profile} size={32} />
        ) : (
          <span className="block h-8 w-8 rounded-full bg-zinc-200" />
        )}
      </Link>
    </nav>
  );
}
