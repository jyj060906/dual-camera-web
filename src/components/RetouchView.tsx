"use client";

import { useEffect, useRef, useState } from "react";
import { stamp, type Tool, type Work } from "@/lib/retouch";

type Props = {
  work: Work | null;
  tool: Tool;
  sizePct: number; // 브러시 크기: 사진 너비 대비 %
  strength: number; // 0~1
  color: string;
  marker: { x: number; y: number } | null; // 크기 조절에서 찍어 둔 위치(사진 픽셀 좌표)
  onPlace: (x: number, y: number) => void; // 크기 조절 위치를 새로 찍었을 때
  onStrokeStart: () => void; // 칠하기 시작할 때(되돌리기용 기록은 부모가 남긴다)
  onStrokeEnd: (work: Work) => void;
};

type Drag = { lastX: number; lastY: number };

// 틀은 3:4로 고정이고 사진은 그 안에 전체가 보이게 맞춰진다.
const FRAME_ASPECT = 3 / 4;

// 보정할 사진 한 장을 통째로 보여 주고, 손가락(마우스)으로 칠하는 대로 사진을 고친다.
export default function RetouchView({
  work,
  tool,
  sizePct,
  strength,
  color,
  marker,
  onPlace,
  onStrokeStart,
  onStrokeEnd,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const placing = useRef(false);
  const [ring, setRing] = useState<{ x: number; y: number; r: number } | null>(null);

  // 보정 중인 canvas를 그대로 화면에 붙인다(칠하는 즉시 보인다).
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || !work) return;
    const c = work.canvas;
    host.appendChild(c);
    return () => {
      if (c.parentNode === host) host.removeChild(c);
    };
  }, [work]);

  // 화면 좌표를 사진 픽셀 좌표로 바꾼다.
  function toImage(clientX: number, clientY: number) {
    const host = hostRef.current!;
    const c = work!.canvas;
    const rect = host.getBoundingClientRect();
    const sc = Math.min(rect.width / c.width, rect.height / c.height);
    const ox = (rect.width - c.width * sc) / 2;
    const oy = (rect.height - c.height * sc) / 2;
    return {
      x: (clientX - rect.left - ox) / sc,
      y: (clientY - rect.top - oy) / sc,
      sc,
      hx: clientX - rect.left,
      hy: clientY - rect.top,
    };
  }

  const radiusPx = () => (sizePct / 100) * work!.canvas.width;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!work) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e.clientX, e.clientY);
    setRing({ x: p.hx, y: p.hy, r: radiusPx() * p.sc });

    if (tool === "resize") {
      placing.current = true; // 손을 뗄 때 위치를 확정한다(끌어서 위치를 옮길 수 있게)
      return;
    }
    onStrokeStart();
    // 콕 누르기만 해도 효과가 보이도록 처음 한 번은 조금 더 세게 적용한다(잡티 지우기는 한 번).
    stamp(work.canvas, tool, p.x, p.y, radiusPx(), strength, color, tool === "heal" ? 1 : 3);
    drag.current = { lastX: p.x, lastY: p.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!work) return;
    const p = toImage(e.clientX, e.clientY);
    setRing({ x: p.hx, y: p.hy, r: radiusPx() * p.sc });
    const d = drag.current;
    if (!d) return;
    // 지나온 길을 따라 빈틈없이 칠한다.
    const rad = radiusPx();
    const dist = Math.hypot(p.x - d.lastX, p.y - d.lastY);
    const n = Math.floor(dist / Math.max(1, rad * 0.3));
    if (n < 1) return;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      stamp(work.canvas, tool, d.lastX + (p.x - d.lastX) * t, d.lastY + (p.y - d.lastY) * t, rad, strength, color, 1);
    }
    d.lastX = p.x;
    d.lastY = p.y;
  }

  function endStroke(e: React.PointerEvent<HTMLDivElement>) {
    if (!work) return;
    if (e.pointerType !== "mouse") setRing(null);
    if (placing.current) {
      placing.current = false;
      const p = toImage(e.clientX, e.clientY);
      onPlace(Math.min(work.canvas.width, Math.max(0, p.x)), Math.min(work.canvas.height, Math.max(0, p.y)));
      return;
    }
    if (!drag.current) return;
    drag.current = null;
    onStrokeEnd(work);
  }

  // 찍어 둔 위치 표시(틀 안의 비율로 계산한다)
  const cw = work?.canvas.width ?? 1;
  const ch = work?.canvas.height ?? 1;
  const contentW = Math.min(1, cw / ch / FRAME_ASPECT);
  const contentH = Math.min(1, FRAME_ASPECT / (cw / ch));

  return (
    <div
      ref={hostRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={() => !drag.current && !placing.current && setRing(null)}
      className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-2xl bg-zinc-900"
    >
      <div ref={canvasHostRef} className="absolute inset-0" />
      {!work && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
          사진을 불러오는 중...
        </p>
      )}
      {tool === "resize" && marker && work && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full border-2 border-dashed border-pink-300"
          style={{
            left: `${50 + (marker.x / cw - 0.5) * contentW * 100}%`,
            top: `${50 + (marker.y / ch - 0.5) * contentH * 100}%`,
            width: `${2 * sizePct * contentW}%`,
            aspectRatio: 1,
            transform: "translate(-50%, -50%)",
          }}
        >
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-300" />
        </div>
      )}
      {ring && (
        <div
          className="pointer-events-none absolute rounded-full border-2 border-white/90 shadow"
          style={{
            left: ring.x - ring.r,
            top: ring.y - ring.r,
            width: ring.r * 2,
            height: ring.r * 2,
          }}
        />
      )}
    </div>
  );
}
