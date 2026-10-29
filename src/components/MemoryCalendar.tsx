"use client";

import { useMemo, useState } from "react";
import type { Post } from "@/lib/posts";
import { useMounted } from "@/lib/useMounted";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// 추억 달력: 내가 올린 듀얼 사진이 날짜별로 모인다. 사진이 있는 날을 누르면 그날의 사진을 크게 본다.
// 날짜는 보는 기기의 시간대(올린 시각의 현지 날짜) 기준이다.
export default function MemoryCalendar({ posts, onOpen }: { posts: Post[]; onOpen: (post: Post) => void }) {
  // 가장 최근 게시물이 있는 달에서 시작한다(없으면 이번 달).
  const [month, setMonth] = useState(() => {
    const d = posts.length ? new Date(Math.max(...posts.map((p) => new Date(p.created_at).getTime()))) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // 날짜별 게시물(최신순). 칸에는 그날의 가장 최근 사진을 보여 준다.
  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) {
      const k = key(new Date(p.created_at));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    for (const list of m.values()) list.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return m;
  }, [posts]);

  const year = month.getFullYear();
  const mon = month.getMonth();
  const first = new Date(year, mon, 1).getDay();
  const days = new Date(year, mon + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => i - first + 1);
  const countThisMonth = cells.reduce((n, d) => n + (d >= 1 && d <= days ? (byDay.get(key(new Date(year, mon, d)))?.length ?? 0) : 0), 0);
  const mounted = useMounted();
  const today = mounted ? key(new Date()) : ""; // 오늘 표시는 브라우저에 붙은 뒤에만 계산한다

  return (
    <section aria-label="추억 달력" className="px-5 pb-6 pt-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonth(new Date(year, mon - 1, 1))} aria-label="이전 달" className="h-11 w-11 text-xl">
          ←
        </button>
        <div className="text-center">
          <p className="text-[17px] font-medium">
            {year}.{String(mon + 1).padStart(2, "0")}
          </p>
          <p className="text-xs" style={{ color: "#555555" }}>
            {countThisMonth}장
          </p>
        </div>
        <button onClick={() => setMonth(new Date(year, mon + 1, 1))} aria-label="다음 달" className="h-11 w-11 text-xl">
          →
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-[3px] text-center text-xs" style={{ color: "#555555" }}>
        {WEEK.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((d, i) => {
          if (d < 1 || d > days) return <span key={i} aria-hidden className="aspect-[3/4]" />;
          const k = key(new Date(year, mon, d));
          const list = byDay.get(k);
          const cover = list?.[0];
          return (
            <div key={i} className="relative aspect-[3/4] overflow-hidden bg-[#F2F2F2]" style={k === today ? { outline: "1px solid #000", outlineOffset: -1 } : undefined}>
              {cover ? (
                <button onClick={() => onOpen(cover)} aria-label={`${mon + 1}월 ${d}일 사진 ${list.length}장 보기`} className="block h-full w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover.imageUrl} alt="" className="h-full w-full object-cover" />
                  <span className="absolute left-0.5 top-0.5 bg-white px-1 text-[10px] leading-4">{d}</span>
                  {list.length > 1 && (
                    <span className="absolute bottom-0.5 right-0.5 bg-black px-1 text-[10px] leading-4 text-white">{list.length}</span>
                  )}
                </button>
              ) : (
                <span className="absolute left-1 top-0.5 text-[10px]" style={{ color: "#767676" }}>
                  {d}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {posts.length === 0 && (
        <p className="mt-4 text-center text-sm" style={{ color: "#555555" }}>
          올린 사진이 날짜별로 이곳에 모여요.
        </p>
      )}
    </section>
  );
}
