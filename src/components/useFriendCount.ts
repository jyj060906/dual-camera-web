"use client";

import { useEffect, useState } from "react";
import { REQUESTS_CHANGED, countFriends } from "@/lib/social";

// 친구 수. 불러오지 못하면(null) 화면에는 아무것도 보이지 않는다. 친구 요청을 수락·거절하면 다시 센다.
export function useFriendCount(userId: string | null): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = () =>
      countFriends(userId)
        .then((n) => !cancelled && setCount(n))
        .catch(() => undefined);
    load();
    window.addEventListener(REQUESTS_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(REQUESTS_CHANGED, load);
    };
  }, [userId]);
  return userId ? count : null;
}
