"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export function SetupNotice() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-medium">로그인 기능이 아직 설정되지 않았어요</p>
      <p className="mt-1">
        <code>.env.local</code>에 Supabase 주소와 키를 넣어야 해요. 설정 방법은{" "}
        <code>supabase/README.md</code>를 보세요.
      </p>
    </div>
  );
}

// 로그인한 사람에게만 보여 주는 영역. needUsername이면 아이디를 정한 사람에게만 보여 준다.
export default function RequireLogin({
  children,
  needUsername = false,
}: {
  children: React.ReactNode;
  needUsername?: boolean;
}) {
  const { status, configured, profile } = useAuth();

  if (!configured) return <SetupNotice />;
  if (status === "loading" || (status === "in" && !profile)) {
    return <p className="text-sm text-zinc-500">불러오는 중...</p>;
  }
  if (status === "out") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
        <p>로그인이 필요해요.</p>
        <Link href="/login" className="rounded-none bg-pink-500 py-2 text-center font-medium text-white">
          로그인하러 가기
        </Link>
      </div>
    );
  }
  if (needUsername && profile && !profile.username) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
        <p>친구를 찾고 추가하려면 먼저 아이디를 만들어야 해요.</p>
        <Link href="/profile" className="rounded-none bg-pink-500 py-2 text-center font-medium text-white">
          아이디 만들기
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
