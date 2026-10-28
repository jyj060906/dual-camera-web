"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, type Profile } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { listPostsBy, type Post } from "@/lib/posts";
import {
  acceptFriendRequest,
  followUser,
  getFollowCounts,
  getProfileByUsername,
  getRelation,
  removeFriendship,
  sendFriendRequest,
  unfollowUser,
  type Follow,
  type Friendship,
} from "@/lib/social";
import Avatar, { displayName } from "./Avatar";
import PostViewer from "./PostViewer";
import RequireLogin from "./RequireLogin";

type Loaded = {
  profile: Profile | null;
  counts: { followers: number; following: number };
  friendship: Friendship | null;
  follow: Follow | null;
};

function Inner({ username, myId }: { username: string; myId: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const profileId = data?.profile?.id ?? null;

  // 이 사람의 게시물: DB 규칙이 볼 수 있는 것만 돌려준다(공개 계정의 공개 게시물, 내 프로필이면 내 것 전부).
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listPostsBy(profileId);
        if (!cancelled) {
          setPosts(list);
          setPostsError(null);
        }
      } catch (e) {
        if (!cancelled) setPostsError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await getProfileByUsername(username);
        if (!profile) return !cancelled && setData({ profile: null, counts: { followers: 0, following: 0 }, friendship: null, follow: null });
        const [counts, relation] = await Promise.all([
          getFollowCounts(profile.id),
          profile.id === myId ? Promise.resolve({ friendship: null, follow: null }) : getRelation(myId, profile.id),
        ]);
        if (!cancelled) setData({ profile, counts, ...relation });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "불러오지 못했어요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, myId, version]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "문제가 생겼어요.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="text-sm text-red-500">{error}</p>;
  if (!data) return <p className="text-sm text-zinc-500">불러오는 중...</p>;
  const { profile, counts, friendship, follow } = data;
  if (!profile) return <p className="text-sm text-zinc-500">@{username} 사용자를 찾을 수 없어요.</p>;

  const isMe = profile.id === myId;
  const btn = "rounded-none border px-4 py-2 text-sm disabled:opacity-50";
  const primary = "rounded-none bg-pink-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

  // 친구: 서로 수락한 관계
  let friendButtons: React.ReactNode = null;
  if (!friendship) {
    friendButtons = (
      <button disabled={busy} className={primary} onClick={() => act(() => sendFriendRequest(myId, profile.id))}>
        친구 요청
      </button>
    );
  } else if (friendship.status === "accepted") {
    friendButtons = (
      <button
        disabled={busy}
        className={btn}
        onClick={() => confirm("친구를 끊을까요?") && act(() => removeFriendship(myId, profile.id))}
      >
        친구 ✓
      </button>
    );
  } else if (friendship.requester === myId) {
    friendButtons = (
      <button disabled={busy} className={btn} onClick={() => act(() => removeFriendship(myId, profile.id))}>
        요청 취소
      </button>
    );
  } else {
    friendButtons = (
      <>
        <button disabled={busy} className={primary} onClick={() => act(() => acceptFriendRequest(myId, profile.id))}>
          친구 요청 수락
        </button>
        <button disabled={busy} className={btn} onClick={() => act(() => removeFriendship(myId, profile.id))}>
          거절
        </button>
      </>
    );
  }

  // 팔로우: 한쪽이 구독하는 관계(비공개 계정은 승인 대기)
  const followButton = !follow ? (
    <button disabled={busy} className={btn} onClick={() => act(() => followUser(myId, profile.id))}>
      팔로우
    </button>
  ) : follow.status === "pending" ? (
    <button disabled={busy} className={btn} onClick={() => act(() => unfollowUser(myId, profile.id))}>
      요청됨 · 취소
    </button>
  ) : (
    <button disabled={busy} className={btn} onClick={() => act(() => unfollowUser(myId, profile.id))}>
      팔로잉
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar person={profile} size={80} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{displayName(profile)}</p>
          <p className="text-sm text-zinc-500">@{profile.username}</p>
          {profile.is_private && (
            <span className="mt-1 inline-block rounded-none bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              비공개 계정
            </span>
          )}
        </div>
      </div>

      {profile.bio && <p className="whitespace-pre-wrap text-sm">{profile.bio}</p>}

      <div className="flex gap-6 text-sm">
        <span>
          <b>{counts.followers}</b> 팔로워
        </span>
        <span>
          <b>{counts.following}</b> 팔로잉
        </span>
      </div>

      {isMe ? (
        <div className="flex gap-2 text-sm">
          <Link href="/profile" className={btn}>
            프로필 수정
          </Link>
          <Link href="/friends" className={btn}>
            친구 관리
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {friendButtons}
          {followButton}
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <section aria-label="게시물" className="-mx-4 border-t pt-3">
        {postsError && <p className="px-4 text-sm text-red-500">{postsError}</p>}
        {!postsError && posts === null && <p className="px-4 text-sm text-zinc-500">게시물을 불러오는 중...</p>}
        {posts?.length === 0 && (
          <p className="px-4 text-sm text-zinc-500">
            {isMe ? "아직 올린 게시물이 없어요." : "볼 수 있는 게시물이 없어요."}
          </p>
        )}
        {posts && posts.length > 0 && (
          <ul className="grid grid-cols-3 gap-[3px]">
            {posts.map((p, i) => (
              <li key={p.id}>
                <button onClick={() => setOpenId(p.id)} className="block w-full" aria-label={`${i + 1}번째 게시물 열기`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt={p.caption || "듀얼샷"} className="aspect-[3/4] w-full bg-[#F2F2F2] object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openId && posts && (
        <PostViewer posts={posts} startId={openId} handle={`@${profile.username}`} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

export default function UserProfileView() {
  const params = useParams<{ username: string }>();
  const { user } = useAuth();
  const username = decodeURIComponent(params.username ?? "");
  return (
    <RequireLogin>
      {user && <Inner key={username} username={username} myId={user.id} />}
    </RequireLogin>
  );
}
