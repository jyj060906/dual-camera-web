"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useNewComments } from "./useNewComments";

// 하단 탭 3개: 홈 / 촬영(가운데 큰 버튼) / 나. 로그인 화면에서는 보이지 않는다.
const HIDDEN = ["/login", "/auth"];

function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  // 내 게시물에 새 댓글이 달렸고 아직 '나' 화면을 보지 않았으면 '나' 탭에 점을 단다.
  const newComment = useNewComments(user?.id ?? null, pathname === "/me");
  if (HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const isFeed = pathname === "/";
  const isShoot = pathname === "/shoot";
  const isMe = ["/me", "/profile", "/friends"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const item = (on: boolean) =>
    `flex h-14 flex-1 items-center justify-center text-[15px] ${on ? "font-medium underline underline-offset-[6px]" : "text-[#767676]"}`;

  return (
    <>
      {/* 고정된 탭이 내용을 가리지 않도록 자리를 비워 둔다 */}
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom))] flex-none" />
      <nav
        aria-label="주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-xl items-center">
          <Link href="/" className={item(isFeed)} aria-current={isFeed ? "page" : undefined}>
            홈
          </Link>
          <div className="flex flex-1 justify-center">
            <Link
              href="/shoot"
              aria-label="촬영"
              aria-current={isShoot ? "page" : undefined}
              className={`-mt-5 flex h-14 w-14 items-center justify-center bg-black text-white ${isShoot ? "ring-2 ring-black ring-offset-2" : ""}`}
            >
              <CameraIcon />
            </Link>
          </div>
          <Link href="/me" className={item(isMe)} aria-current={isMe ? "page" : undefined}>
            <span className="relative">
              나
              {newComment && (
                <span
                  role="status"
                  aria-label="내 게시물에 새 댓글이 있어요"
                  className="absolute -right-2.5 -top-0.5 h-2 w-2 rounded-full"
                  style={{ background: "#E5252A" }}
                />
              )}
            </span>
          </Link>
        </div>
      </nav>
    </>
  );
}
