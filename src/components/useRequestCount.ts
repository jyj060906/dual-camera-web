"use client";

import { useEffect, useState } from "react";
import { REQUESTS_CHANGED, countIncomingRequests } from "@/lib/social";
import { getSupabase } from "@/lib/supabase";

// 받은 요청 개수. 앱 안에서 수락·거절하면(REQUESTS_CHANGED) 바로 다시 세고,
// Supabase Realtime으로 새 요청이 오면 새로고침 없이 반영한다. Realtime이 안 되는 환경에서는 화면에 다시 돌아올 때 갱신된다.
export function useRequestCount(userId: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const refresh = () => {
      countIncomingRequests(userId)
        .then((n) => !cancelled && setCount(n))
        .catch(() => undefined); // 알림 점이 실패해도 화면에는 아무 문구도 내지 않는다
    };
    refresh();

    const onVisible = () => document.visibilityState === "visible" && refresh();
    window.addEventListener(REQUESTS_CHANGED, refresh);
    document.addEventListener("visibilitychange", onVisible);

    let channel: ReturnType<ReturnType<typeof getSupabase>["channel"]> | null = null;
    const sb = getSupabase();
    try {
      channel = sb
        .channel(`requests-${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "follows" }, refresh)
        .subscribe();
    } catch {
      channel = null;
    }

    return () => {
      cancelled = true;
      window.removeEventListener(REQUESTS_CHANGED, refresh);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void sb.removeChannel(channel);
    };
  }, [userId]);

  return userId ? count : 0;
}
