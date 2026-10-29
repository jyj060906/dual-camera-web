"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  acceptFriendRequest,
  approveFollower,
  listFollowers,
  listFollowing,
  listFriendRequests,
  listFriends,
  removeFollower,
  removeFriendship,
  REQUESTS_CHANGED,
  searchProfiles,
  unfollowUser,
  type Person,
  type Status,
} from "@/lib/social";
import Avatar, { displayName } from "./Avatar";
import RequireLogin from "./RequireLogin";
import Tabs from "./Tabs";

type TabId = "friends" | "requests" | "following" | "followers";

const TABS: { id: TabId; label: string }[] = [
  { id: "friends", label: "친구" },
  { id: "requests", label: "요청" },
  { id: "following", label: "팔로잉" },
  { id: "followers", label: "팔로워" },
];

function PersonRow({ person, children }: { person: Person; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Link href={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar person={person} size={40} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{displayName(person)}</span>
          <span className="block truncate text-xs text-zinc-500">@{person.username}</span>
        </span>
      </Link>
      <div className="flex shrink-0 gap-1">{children}</div>
    </li>
  );
}

const small = "rounded-none border px-3 py-1 text-xs disabled:opacity-50";
const smallPrimary = "rounded-none bg-pink-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50";

// 목록을 불러와 보여 주는 공통 틀. reload()를 부르면 다시 불러온다.
function useList<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "불러오지 못했어요."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setVersion((v) => v + 1);
      window.dispatchEvent(new Event(REQUESTS_CHANGED)); // 홈의 알림 점이 바로 줄어든다
    } catch (e) {
      setError(e instanceof Error ? e.message : "문제가 생겼어요.");
    } finally {
      setBusy(false);
    }
  }
  return { data, error, busy, act };
}

const Empty = ({ text }: { text: string }) => <p className="py-6 text-center text-sm text-zinc-400">{text}</p>;
const Loading = () => <p className="py-6 text-center text-sm text-zinc-400">불러오는 중...</p>;
const ErrorText = ({ text }: { text: string | null }) =>
  text ? <p className="text-sm text-red-500">{text}</p> : null;

function FriendsTab({ me }: { me: string }) {
  const { data, error, busy, act } = useList(() => listFriends(me), [me]);
  if (!data) return error ? <ErrorText text={error} /> : <Loading />;
  return (
    <>
      <ErrorText text={error} />
      {data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-sm">
          <p>아직 친구가 없어요</p>
          <button
            onClick={() => {
              const input = document.getElementById("friend-search");
              input?.scrollIntoView({ block: "center" });
              input?.focus();
            }}
            className="h-11 bg-black px-5 text-white"
          >
            친구 찾기
          </button>
        </div>
      ) : (
        <ul className="divide-y">
          {data.map((p) => (
            <PersonRow key={p.id} person={p}>
              <button
                disabled={busy}
                className={small}
                onClick={() => confirm(`${displayName(p)}님과 친구를 끊을까요?`) && act(() => removeFriendship(me, p.id))}
              >
                끊기
              </button>
            </PersonRow>
          ))}
        </ul>
      )}
    </>
  );
}

function RequestsTab({ me }: { me: string }) {
  const friends = useList(() => listFriendRequests(me), [me]);
  const followers = useList(() => listFollowers(me), [me]);
  if (!friends.data || !followers.data) {
    return friends.error || followers.error ? <ErrorText text={friends.error ?? followers.error} /> : <Loading />;
  }
  const { incoming, outgoing } = friends.data;
  const pendingFollowers = followers.data.pending;
  const none = incoming.length + outgoing.length + pendingFollowers.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <ErrorText text={friends.error ?? followers.error} />
      {none && <Empty text="처리할 요청이 없어요." />}

      {incoming.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-zinc-500">받은 친구 요청</h3>
          <ul className="divide-y">
            {incoming.map((p) => (
              <PersonRow key={p.id} person={p}>
                <button disabled={friends.busy} className={smallPrimary} onClick={() => friends.act(() => acceptFriendRequest(me, p.id))}>
                  수락
                </button>
                <button disabled={friends.busy} className={small} onClick={() => friends.act(() => removeFriendship(me, p.id))}>
                  거절
                </button>
              </PersonRow>
            ))}
          </ul>
        </section>
      )}

      {pendingFollowers.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-zinc-500">팔로우 요청 (비공개 계정)</h3>
          <ul className="divide-y">
            {pendingFollowers.map((p) => (
              <PersonRow key={p.id} person={p}>
                <button disabled={followers.busy} className={smallPrimary} onClick={() => followers.act(() => approveFollower(me, p.id))}>
                  승인
                </button>
                <button disabled={followers.busy} className={small} onClick={() => followers.act(() => removeFollower(me, p.id))}>
                  거절
                </button>
              </PersonRow>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-zinc-500">내가 보낸 친구 요청</h3>
          <ul className="divide-y">
            {outgoing.map((p) => (
              <PersonRow key={p.id} person={p}>
                <button disabled={friends.busy} className={small} onClick={() => friends.act(() => removeFriendship(me, p.id))}>
                  취소
                </button>
              </PersonRow>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FollowingTab({ me }: { me: string }) {
  const { data, error, busy, act } = useList(() => listFollowing(me), [me]);
  if (!data) return error ? <ErrorText text={error} /> : <Loading />;
  const label = (s: Status) => (s === "pending" ? "요청 취소" : "언팔로우");
  return (
    <>
      <ErrorText text={error} />
      {data.length === 0 ? (
        <Empty text="팔로우한 사람이 없어요." />
      ) : (
        <ul className="divide-y">
          {data.map((p) => (
            <PersonRow key={p.id} person={p}>
              {p.status === "pending" && <span className="self-center text-xs text-zinc-400">요청됨</span>}
              <button disabled={busy} className={small} onClick={() => act(() => unfollowUser(me, p.id))}>
                {label(p.status)}
              </button>
            </PersonRow>
          ))}
        </ul>
      )}
    </>
  );
}

function FollowersTab({ me }: { me: string }) {
  const { data, error, busy, act } = useList(() => listFollowers(me), [me]);
  if (!data) return error ? <ErrorText text={error} /> : <Loading />;
  return (
    <>
      <ErrorText text={error} />
      {data.accepted.length === 0 ? (
        <Empty text="아직 팔로워가 없어요." />
      ) : (
        <ul className="divide-y">
          {data.accepted.map((p) => (
            <PersonRow key={p.id} person={p}>
              <button
                disabled={busy}
                className={small}
                onClick={() => confirm(`${displayName(p)}님을 팔로워에서 삭제할까요?`) && act(() => removeFollower(me, p.id))}
              >
                삭제
              </button>
            </PersonRow>
          ))}
        </ul>
      )}
    </>
  );
}

function Search({ me }: { me: string }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResults(await searchProfiles(term, me));
    } catch (err) {
      setError(err instanceof Error ? err.message : "찾지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <form onSubmit={submit} className="flex gap-2 text-sm">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value.toLowerCase())}
          id="friend-search"
          placeholder="아이디로 찾기"
          autoCapitalize="none"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border px-3 py-2"
        />
        <button
          disabled={busy || !term.trim()}
          className={`px-4 font-medium text-white ${term.trim() ? "bg-black" : "bg-[#767676]"} ${busy ? "opacity-60" : ""}`}
        >
          검색
        </button>
      </form>
      <ErrorText text={error} />
      {results && (results.length === 0 ? (
        <Empty text="찾는 사람이 없어요." />
      ) : (
        <ul className="divide-y rounded-xl border px-3">
          {results.map((p) => (
            <PersonRow key={p.id} person={p}>
              <Link href={`/u/${p.username}`} className={small}>
                프로필
              </Link>
            </PersonRow>
          ))}
        </ul>
      ))}
    </section>
  );
}

function ShareProfile({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/u/${username}`;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "듀얼 카메라에서 친구가 돼요", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 공유 창을 닫은 경우 등은 무시한다.
    }
  }

  return (
    <button onClick={share} className="rounded-xl border px-3 py-2 text-left text-sm">
      <span className="block text-xs text-zinc-500">내 프로필 공유하기</span>
      <span className="block truncate text-pink-600">{copied ? "링크를 복사했어요" : `/u/${username}`}</span>
    </button>
  );
}

function Inner({ me, username }: { me: string; username: string | null }) {
  // 홈의 사람 아이콘에서 들어오면(?tab=requests) 요청 탭을 바로 연다. 이 화면은 로그인 확인 뒤에 그려져서 브라우저에서만 만들어진다.
  const [tab, setTab] = useState<TabId>(() => {
    const t = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab");
    return TABS.find((x) => x.id === t)?.id ?? "friends";
  });
  return (
    <div className="flex flex-col gap-4">
      {username && <ShareProfile username={username} />}
      <Search me={me} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "friends" && <FriendsTab me={me} />}
      {tab === "requests" && <RequestsTab me={me} />}
      {tab === "following" && <FollowingTab me={me} />}
      {tab === "followers" && <FollowersTab me={me} />}
    </div>
  );
}

export default function FriendsView() {
  const { user, profile } = useAuth();
  return (
    <RequireLogin needUsername>{user && <Inner me={user.id} username={profile?.username ?? null} />}</RequireLogin>
  );
}
