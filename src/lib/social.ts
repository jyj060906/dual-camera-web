import { PROFILE_COLUMNS, type Profile } from "./auth";
import { getSupabase } from "./supabase";

export type Person = Pick<Profile, "id" | "username" | "nickname" | "avatar_url" | "is_private">;
const PERSON_COLUMNS = "id, username, nickname, avatar_url, is_private";

export type Status = "pending" | "accepted";
export type Friendship = { requester: string; addressee: string; status: Status };
export type Follow = { follower: string; following: string; status: Status };

// supabase 응답에서 오류를 던지고 데이터만 꺼낸다.
function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const e = new Error(res.error.message) as Error & { code?: string };
    e.code = res.error.code;
    throw e;
  }
  return res.data as T;
}

// 두 사람 사이의 친구 행(방향 무관)을 고르는 조건
const pair = (a: string, b: string) =>
  `and(requester.eq.${a},addressee.eq.${b}),and(requester.eq.${b},addressee.eq.${a})`;

// ── 프로필 ──

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const res = await getSupabase()
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("username", username.toLowerCase())
    .maybeSingle();
  return must(res) as Profile | null;
}

// 아이디가 입력한 글자로 시작하는 사람을 찾는다. _는 검색 패턴에서 "아무 글자"라 \_로 막는다.
export async function searchProfiles(term: string, myId: string): Promise<Person[]> {
  const clean = term.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!clean) return [];
  const res = await getSupabase()
    .from("profiles")
    .select(PERSON_COLUMNS)
    .ilike("username", `${clean.replace(/_/g, "\\_")}%`)
    .neq("id", myId)
    .not("username", "is", null)
    .order("username")
    .limit(10);
  return must(res) as Person[];
}

async function peopleByIds(ids: string[]): Promise<Map<string, Person>> {
  if (ids.length === 0) return new Map();
  const res = await getSupabase().from("profiles").select(PERSON_COLUMNS).in("id", ids);
  return new Map((must(res) as Person[]).map((p) => [p.id, p]));
}

export async function getRelation(me: string, other: string) {
  const sb = getSupabase();
  const [f, w] = await Promise.all([
    sb.from("friendships").select("requester, addressee, status").or(pair(me, other)).maybeSingle(),
    sb
      .from("follows")
      .select("follower, following, status")
      .eq("follower", me)
      .eq("following", other)
      .maybeSingle(),
  ]);
  return { friendship: must(f) as Friendship | null, follow: must(w) as Follow | null };
}

export async function getFollowCounts(userId: string) {
  const sb = getSupabase();
  const [a, b] = await Promise.all([
    sb.from("follows").select("*", { count: "exact", head: true }).eq("following", userId).eq("status", "accepted"),
    sb.from("follows").select("*", { count: "exact", head: true }).eq("follower", userId).eq("status", "accepted"),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (b.error) throw new Error(b.error.message);
  return { followers: a.count ?? 0, following: b.count ?? 0 };
}

// ── 친구 ──

export async function sendFriendRequest(me: string, other: string) {
  const res = await getSupabase().from("friendships").insert({ requester: me, addressee: other });
  if (res.error) {
    // 상대가 먼저 요청을 보내 둔 경우(두 사람 사이에는 한 줄만 있을 수 있다)
    if (res.error.code === "23505") throw new Error("이미 요청이 있어요. 화면을 새로고침해 주세요.");
    throw new Error(res.error.message);
  }
}

export async function acceptFriendRequest(me: string, requester: string) {
  const res = await getSupabase()
    .from("friendships")
    .update({ status: "accepted" })
    .eq("requester", requester)
    .eq("addressee", me)
    .select();
  if (must(res).length === 0) throw new Error("요청을 찾을 수 없어요. 취소됐을 수 있어요.");
}

// 요청 취소·거절·친구 끊기는 모두 두 사람 사이의 행을 지우는 것이다.
export async function removeFriendship(me: string, other: string) {
  const res = await getSupabase().from("friendships").delete().or(pair(me, other));
  if (res.error) throw new Error(res.error.message);
}

export async function listFriends(me: string): Promise<Person[]> {
  const res = await getSupabase()
    .from("friendships")
    .select("requester, addressee")
    .eq("status", "accepted")
    .or(`requester.eq.${me},addressee.eq.${me}`);
  const rows = must(res) as { requester: string; addressee: string }[];
  const ids = rows.map((r) => (r.requester === me ? r.addressee : r.requester));
  const people = await peopleByIds(ids);
  return ids.map((id) => people.get(id)).filter((p): p is Person => !!p);
}

export async function listFriendRequests(me: string) {
  const res = await getSupabase()
    .from("friendships")
    .select("requester, addressee")
    .eq("status", "pending")
    .or(`requester.eq.${me},addressee.eq.${me}`);
  const rows = must(res) as { requester: string; addressee: string }[];
  const incomingIds = rows.filter((r) => r.addressee === me).map((r) => r.requester);
  const outgoingIds = rows.filter((r) => r.requester === me).map((r) => r.addressee);
  const people = await peopleByIds([...incomingIds, ...outgoingIds]);
  const pick = (ids: string[]) => ids.map((id) => people.get(id)).filter((p): p is Person => !!p);
  return { incoming: pick(incomingIds), outgoing: pick(outgoingIds) };
}

// ── 팔로우 ──

export async function followUser(me: string, other: string): Promise<Status> {
  const res = await getSupabase()
    .from("follows")
    .insert({ follower: me, following: other })
    .select("status")
    .single();
  return (must(res) as { status: Status }).status;
}

// 언팔로우·요청 취소
export async function unfollowUser(me: string, other: string) {
  const res = await getSupabase().from("follows").delete().eq("follower", me).eq("following", other);
  if (res.error) throw new Error(res.error.message);
}

export async function approveFollower(me: string, follower: string) {
  const res = await getSupabase()
    .from("follows")
    .update({ status: "accepted" })
    .eq("follower", follower)
    .eq("following", me)
    .select();
  if (must(res).length === 0) throw new Error("요청을 찾을 수 없어요. 취소됐을 수 있어요.");
}

// 팔로우 요청 거절·팔로워 삭제
export async function removeFollower(me: string, follower: string) {
  const res = await getSupabase().from("follows").delete().eq("follower", follower).eq("following", me);
  if (res.error) throw new Error(res.error.message);
}

export async function listFollowing(me: string): Promise<(Person & { status: Status })[]> {
  const res = await getSupabase()
    .from("follows")
    .select("following, status")
    .eq("follower", me);
  const rows = must(res) as { following: string; status: Status }[];
  const people = await peopleByIds(rows.map((r) => r.following));
  return rows.flatMap((r) => {
    const p = people.get(r.following);
    return p ? [{ ...p, status: r.status }] : [];
  });
}

export async function listFollowers(me: string): Promise<{ accepted: Person[]; pending: Person[] }> {
  const res = await getSupabase().from("follows").select("follower, status").eq("following", me);
  const rows = must(res) as { follower: string; status: Status }[];
  const people = await peopleByIds(rows.map((r) => r.follower));
  const pick = (status: Status) =>
    rows
      .filter((r) => r.status === status)
      .map((r) => people.get(r.follower))
      .filter((p): p is Person => !!p);
  return { accepted: pick("accepted"), pending: pick("pending") };
}
