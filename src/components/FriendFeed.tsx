"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { listFriendFeed, type Post } from "@/lib/posts";
import { UsersIcon } from "./icons";
import PostViewer from "./PostViewer";
import RequireLogin from "./RequireLogin";
import { useRequestCount } from "./useRequestCount";

// 홈 탭: 내 글과 친구들의 듀얼 사진을 최신순으로 보여 준다. 사진을 올리지 않아도 언제든 볼 수 있다.
function Inner() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listFriendFeed(userId);
        if (!cancelled) setPosts(list);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) return <p className="px-4 text-sm text-red-600">{error}</p>;
  if (!posts) return <p className="px-4 text-sm text-zinc-500">불러오는 중...</p>;
  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-sm">
        <p>아직 볼 사진이 없어요.</p>
        <p style={{ color: "#555555" }}>친구를 추가하면 친구의 사진도 여기에 보여요</p>
        <div className="flex gap-2">
          <Link href="/friends" className="border px-4 py-2">
            친구 찾기
          </Link>
          <Link href="/shoot" className="bg-black px-4 py-2 text-white">
            찍으러 가기
          </Link>
        </div>
      </div>
    );
  }
  const hasFriendPosts = posts.some((p) => p.author && p.author.id !== userId);
  return (
    <>
      {!hasFriendPosts && (
        <p className="px-4 pb-3 text-sm" style={{ color: "#555555" }}>
          친구를 추가하면 친구의 사진도 여기에 보여요{" "}
          <Link href="/friends" className="underline">
            친구 찾기
          </Link>
        </p>
      )}
      <PostViewer posts={posts} inline onDeleted={(id) => setPosts((cur) => cur && cur.filter((x) => x.id !== id))} />
    </>
  );
}

export default function FriendFeed() {
  const { user } = useAuth();
  const pending = useRequestCount(user?.id ?? null);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h1 className="text-[28px] font-medium leading-none tracking-[-0.5px]">홈</h1>
        <Link
          href="/friends?tab=requests"
          aria-label={pending > 0 ? `친구, 새 요청 ${pending}개` : "친구"}
          title="친구"
          className="relative flex h-11 w-11 items-center justify-center"
        >
          <UsersIcon className="h-6 w-6" />
          {/* 받은 요청이 있을 때만 보이는 빨간 점. 빨강은 앱에서 이 점에만 쓴다. */}
          {pending > 0 && (
            <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ background: "#E5252A" }} />
          )}
        </Link>
      </header>
      <RequireLogin>
        <Inner />
      </RequireLogin>
    </div>
  );
}
