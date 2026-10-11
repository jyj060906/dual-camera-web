"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

// 처음 들어오면 로그인 화면부터 보여 준다. 한 번 로그인하면 브라우저에 로그인 상태가
// 남아서(Supabase 세션) 다음부터는 바로 이 화면으로 들어온다.
// 로그인 기능이 설정되지 않은 환경(.env.local 없음)에서는 막지 않고 그대로 보여 준다.
export default function HomeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, configured } = useAuth();
  const blocked = configured && status !== "in";

  useEffect(() => {
    if (configured && status === "out") router.replace("/login");
  }, [configured, status, router]);

  if (blocked) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500" role="status">
        {status === "loading" ? "불러오는 중..." : "로그인 화면으로 이동하는 중..."}
      </p>
    );
  }
  return <>{children}</>;
}
