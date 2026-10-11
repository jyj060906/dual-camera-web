"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_UNDO, getCtx, stamp, type Tool, type Work } from "@/lib/retouch";

type Props = {
  work: Work | null;
  tool: Tool;
  sizePct: number; // 브러시 크기: 사진 너비 대비 %
  strength: number; // 0~1
  color: string;
  onStrokeEnd: (work: Work) => void;
};

type Drag = {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  time: number;
  raf: number;
};

// 보정할 사진 한 장을 통째로 보여 주고, 손가락(마우스)으로 칠하는 대로 사진을 고친다.
export default function RetouchView({ work, tool, sizePct, strength, color, onStrokeEnd }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const settings = useRef({ tool, sizePct, strength, color });
  const [ring, setRing] = useState<{ x: number; y: number; r: number } | null>(null);

  useEffect(() => {
    settings.current = { tool, sizePct, strength, color };
  });

  // 보정 중인 canvas를 그대로 화면에 붙인다(칠하는 즉시 보인다).
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || !work) return;
    const c = work.canvas;
    c.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;";
    host.appendChild(c);
    return () => {
      if (c.parentNode === host) host.removeChild(c);
    };
  }, [work]);

  // 화면 좌표를 사진 픽셀 좌표로 바꾼다(사진은 틀 안에 전체가 보이게 맞춰져 있다).
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

  function loop(now: number) {
    const d = drag.current;
    if (!d || !work) return;
    const s = settings.current;
    const rad = (s.sizePct / 100) * work.canvas.width;
    const dt = Math.min(0.1, (now - d.time) / 1000);
    d.time = now;

    if (d.moved) {
      // 지나온 길을 따라 빈틈없이 칠한다.
      const dist = Math.hypot(d.x - d.lastX, d.y - d.lastY);
      const step = Math.max(1, rad * 0.3);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        stamp(work.canvas, s.tool, d.lastX + (d.x - d.lastX) * t, d.lastY + (d.y - d.lastY) * t, rad, s.strength, s.color, 1);
      }
      d.lastX = d.x;
      d.lastY = d.y;
      d.moved = false;
    } else if (s.tool !== "heal") {
      // 한 곳을 누르고 있으면 조금씩 더 적용된다(잡티 지우기는 한 번만).
      stamp(work.canvas, s.tool, d.x, d.y, rad, s.strength, s.color, Math.min(3, dt * 60));
    }
    d.raf = requestAnimationFrame(loop);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!work) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e.clientX, e.clientY);
    const ctx = getCtx(work.canvas);
    work.undo.push(ctx.getImageData(0, 0, work.canvas.width, work.canvas.height));
    if (work.undo.length > MAX_UNDO) work.undo.shift();

    const s = settings.current;
    const rad = (s.sizePct / 100) * work.canvas.width;
    stamp(work.canvas, s.tool, p.x, p.y, rad, s.strength, s.color, 1);
    drag.current = { x: p.x, y: p.y, lastX: p.x, lastY: p.y, moved: false, time: performance.now(), raf: 0 };
    drag.current.raf = requestAnimationFrame(loop);
    setRing({ x: p.hx, y: p.hy, r: rad * p.sc });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!work) return;
    const p = toImage(e.clientX, e.clientY);
    const rad = (settings.current.sizePct / 100) * work.canvas.width;
    setRing({ x: p.hx, y: p.hy, r: rad * p.sc });
    const d = drag.current;
    if (d) {
      d.x = p.x;
      d.y = p.y;
      d.moved = true;
    }
  }

  function endStroke(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || !work) return;
    cancelAnimationFrame(d.raf);
    drag.current = null;
    if (e.pointerType !== "mouse") setRing(null);
    onStrokeEnd(work);
  }

  return (
    <div
      ref={hostRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={() => !drag.current && setRing(null)}
      className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-2xl bg-zinc-900"
    >
      <div ref={canvasHostRef} className="absolute inset-0" />
      {!work && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
          사진을 불러오는 중...
        </p>
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
