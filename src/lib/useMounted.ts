"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

// 서버 렌더링과 처음 그리는 화면에서는 false, 브라우저에 붙은 뒤에는 true.
// 현재 시각·시간대에 따라 달라지는 값("3분 전", 날짜, 올해)은 true일 때만 계산해서 서버와 브라우저의 화면이 어긋나지 않게 한다.
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
