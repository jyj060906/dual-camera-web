"use client";

import { useCallback, useEffect, useState } from "react";
import { countNewCommentsOnMine } from "@/lib/reactions";
import { getSupabase } from "@/lib/supabase";

const key = (userId: string) => `comments-seen-${userId}`;

function readSeen(userId: string): string {
  try {
    const v = localStorage.getItem(key(userId));
    if (v) return v;
    // 처음 쓰는 기기에서는 지금부터 센다(예전 댓글이 한꺼번에 알림이 되지 않게).
    const now = new Date().toISOString();
    localStorage.setItem(key(userId), now);
    return now;
  } catch {
    return new Date().toISOString();
  }
}

// 내 게시물에 다른 사람이 단 댓글 중 아직 '나' 화면에서 확인하지 않은 것이 있는지.
// seenNow가 true이면(지금 '나' 화면을 보는 중) 확인한 것으로 기록하고 점을 숨긴다.
// 새 댓글은 Realtime으로 받아 새로고침 없이 반영한다. 실패해도 화면에는 아무것도 내지 않는다.
export function useNewComments(userId: string | null, seenNow: boolean): boolean {
  const [count, setCount] = useState(0);

  const markSeen = useCallback(() => {
    if (!userId) return;
    try {
      localStorage.setItem(key(userId), new Date().toISOString());
    } catch {
      // 저장이 막힌 환경에서는 이번 접속 동안만 유지된다.
    }
    setCount(0);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (seenNow) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      markSeen();
    }
    let cancelled = false;
    const refresh = () => {
      if (seenNow) return markSeen();
      countNewCommentsOnMine(userId, readSeen(userId))
        .then((n) => !cancelled && setCount(n))
        .catch(() => undefined);
    };
    refresh();
    const sb = getSupabase();
    let channel: ReturnType<typeof sb.channel> | null = null;
    try {
      channel = sb
        .channel(`new-comments-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_comments" }, refresh)
        .subscribe();
    } catch {
      channel = null;
    }
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void sb.removeChannel(channel);
    };
  }, [userId, seenNow, markSeen]);

  return !seenNow && count > 0;
}
