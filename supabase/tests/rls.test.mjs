import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "fs";
import os from "os";
import path from "path";

// 사용법: npm i --no-save embedded-postgres pg && node supabase/tests/rls.test.mjs
// 임시 Postgres를 띄워 supabase/schema.sql의 규칙(RLS·트리거)을 시나리오별로 확인한다. 끝나면 정리된다.
const here = path.dirname(new URL(import.meta.url).pathname);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dual-camera-rls-"));
const schema = fs.readFileSync(path.join(here, "..", "schema.sql"), "utf8");
const server = new EmbeddedPostgres({ databaseDir: `${dir}/data`, user: "postgres", password: "pw", port: 54329, persistent: false });
await server.initialise();
await server.start();
const admin = new pg.Client({ host: "localhost", port: 54329, user: "postgres", password: "pw", database: "postgres" });
await admin.connect();

// Supabase가 기본으로 제공하는 것들을 흉내 낸다(역할, auth.uid(), auth.users, storage)
await admin.query(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select _parts[1:array_length(_parts,1)-1] from string_to_array(name,'/') as _parts $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant execute on function storage.foldername(text) to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
`);

await admin.query(schema);
await admin.query(schema); // 두 번 실행해도 되는지(멱등성)
console.log("schema applied twice OK");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); };

async function as(uid, sql, params = []) {
  const c = new pg.Client({ host: "localhost", port: 54329, user: "postgres", password: "pw", database: "postgres" });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(uid ? "set local role authenticated" : "set local role anon");
    if (uid) await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return { rows: r.rows, count: r.rowCount };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    return { error: e.code, message: e.message };
  } finally { await c.end(); }
}
const signup = async (email, meta = {}) => (await admin.query("insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id", [email, JSON.stringify(meta)])).rows[0].id;

// ── 가입 트리거 ──
const alice = await signup("alice@id.dual-camera.example");
const bob = await signup("bobby@id.dual-camera.example");
const carol = await signup("carol@gmail.com", { full_name: "Carol K", picture: "https://example.com/c.jpg" });
const mallory = await signup("mallory@id.dual-camera.example", { username: "victim" });
const prof = async (id) => (await admin.query("select * from profiles where id=$1", [id])).rows[0];
ok("아이디 가입: 이메일에서 아이디를 꺼내 프로필 생성", (await prof(alice)).username === "alice" && (await prof(alice)).nickname === "alice");
ok("구글/카카오 가입: 아이디 비어 있고 이름·사진 가져옴", (await prof(carol)).username === null && (await prof(carol)).nickname === "Carol K" && (await prof(carol)).avatar_url === "https://example.com/c.jpg");
ok("클라이언트가 보낸 username(메타데이터)은 무시", (await prof(mallory)).username === "mallory");
let r = await admin.query("insert into auth.users (email) values ('ab@id.dual-camera.example')").catch((e) => ({ error: e.code }));
ok("너무 짧은 아이디는 가입 거부(check)", r.error === "23514", r.error);
r = await admin.query("insert into auth.users (email) values ('ALICE@id.dual-camera.example')").catch((e) => ({ error: e.code }));
ok("대소문자만 다른 같은 아이디는 가입 거부(unique)", r.error === "23505", r.error);

// ── 아이디 확인 RPC ──
ok("username_available: 새 아이디 true", (await as(null, "select public.username_available('newname') a")).rows[0].a === true);
ok("username_available: 있는 아이디 false(대소문자 무시, 로그인 전에도 호출)", (await as(null, "select public.username_available('ALICE') a")).rows[0].a === false);

// ── 프로필 ──
ok("anon은 프로필 조회 불가", !!(await as(null, "select * from profiles")).error || (await as(null, "select * from profiles")).rows.length === 0);
ok("로그인한 사람은 모든 프로필 조회", (await as(alice, "select id from profiles")).rows.length === 4);
ok("본인 프로필 수정 가능", (await as(alice, "update profiles set nickname='Alice', bio='hi' where id=$1", [alice])).count === 1);
ok("남의 프로필 수정은 0행", (await as(alice, "update profiles set nickname='hacked' where id=$1", [bob])).count === 0);
r = await as(alice, "update profiles set username='alice2' where id=$1", [alice]);
ok("정한 아이디는 바꿀 수 없음", !!r.error, r.message);
ok("구글 가입자가 아이디를 처음 정함", (await as(carol, "update profiles set username='carol' where id=$1", [carol])).count === 1);
r = await as(carol, "update profiles set username='bob_x' where id=$1", [carol]);
ok("아이디를 한 번 정하면 못 바꿈", !!r.error);
const dave = await signup("dave@gmail.com");
r = await as(dave, "update profiles set username='alice' where id=$1", [dave]);
ok("이미 있는 아이디는 정할 수 없음(unique)", r.error === "23505", r.error);
r = await as(dave, "update profiles set avatar_url='javascript:alert(1)' where id=$1", [dave]);
ok("javascript: 같은 프로필 사진 주소는 거부", r.error === "23514", r.error);
ok("http(로컬 개발) 사진 주소는 허용", (await as(dave, "update profiles set avatar_url='http://localhost:54321/a.jpg' where id=$1", [dave])).count === 1);
r = await as(dave, "update profiles set bio=repeat('a',201) where id=$1", [dave]);
ok("소개글 200자 초과 거부", r.error === "23514", r.error);
r = await as(alice, "insert into profiles (id, username) values (gen_random_uuid(), 'fake_user')");
ok("프로필을 직접 만들 수 없음", !!r.error, r.message);
r = await as(alice, "delete from profiles where id=$1", [alice]);
ok("프로필을 직접 지울 수 없음", r.count === 0, String(r.count));

// ── 친구 ──
ok("친구 요청 보내기", (await as(alice, "insert into friendships (requester, addressee) values ($1,$2)", [alice, bob])).count === 1);
r = await as(alice, "insert into friendships (requester, addressee) values ($1,$2)", [bob, carol]);
ok("남의 이름으로 요청 불가", !!r.error, r.message);
r = await as(alice, "insert into friendships (requester, addressee) values ($1,$1)", [alice]);
ok("자기 자신에게 요청 불가", r.error === "23514", r.error);
r = await as(alice, "insert into friendships (requester, addressee, status) values ($1,$2,'accepted')", [alice, dave]);
ok("요청과 동시에 '수락' 상태로 만들 수 없음", !!r.error, r.message);
r = await as(bob, "insert into friendships (requester, addressee) values ($1,$2)", [bob, alice]);
ok("이미 요청이 있는 사이에 반대 방향 요청 불가", r.error === "23505", r.error);
ok("보낸 사람은 스스로 수락 못 함", (await as(alice, "update friendships set status='accepted' where requester=$1 and addressee=$2", [alice, bob])).count === 0);
ok("제3자는 요청이 보이지 않음", (await as(carol, "select * from friendships")).rows.length === 0);
ok("당사자 둘은 요청이 보임", (await as(bob, "select * from friendships")).rows.length === 1 && (await as(alice, "select * from friendships")).rows.length === 1);
ok("받은 사람이 수락", (await as(bob, "update friendships set status='accepted' where requester=$1 and addressee=$2", [alice, bob])).count === 1);
r = await as(bob, "update friendships set requester=$1 where addressee=$2", [carol, bob]);
ok("관계 당사자를 바꿀 수 없음", !!r.error || r.count === 0, r.message ?? "0 rows");
ok("제3자는 친구 관계를 지울 수 없음", (await as(carol, "delete from friendships")).count === 0);
ok("친구 끊기(당사자)", (await as(bob, "delete from friendships where requester=$1 and addressee=$2", [alice, bob])).count === 1);

// ── 팔로우 ──
ok("공개 계정은 바로 승인", (await as(alice, "insert into follows (follower, following) values ($1,$2) returning status", [alice, bob])).rows[0].status === "accepted");
await as(carol, "update profiles set is_private=true where id=$1", [carol]);
ok("비공개 계정은 승인 대기", (await as(alice, "insert into follows (follower, following) values ($1,$2) returning status", [alice, carol])).rows[0].status === "pending");
ok("클라이언트가 'accepted'를 보내도 서버가 대기로 바꿈", (await as(bob, "insert into follows (follower, following, status) values ($1,$2,'accepted') returning status", [bob, carol])).rows[0].status === "pending");
r = await as(alice, "insert into follows (follower, following) values ($1,$2)", [bob, alice]);
ok("남의 이름으로 팔로우 불가", !!r.error, r.message);
ok("본인은 대기 요청을 스스로 승인 못 함", (await as(alice, "update follows set status='accepted' where follower=$1 and following=$2", [alice, carol])).count === 0);
ok("제3자는 대기 요청을 볼 수 없음", (await as(dave, "select * from follows where following=$1", [carol])).rows.length === 0);
ok("받는 사람은 대기 요청을 봄", (await as(carol, "select * from follows where following=$1 and status='pending'", [carol])).rows.length === 2);
ok("받는 사람이 승인", (await as(carol, "update follows set status='accepted' where follower=$1 and following=$2", [alice, carol])).count === 1);
ok("승인된 팔로우는 누구나 셀 수 있음(팔로워 수)", (await as(dave, "select count(*)::int c from follows where following=$1", [carol])).rows[0].c === 1);
await as(dave, "insert into follows (follower, following) values ($1,$2)", [dave, carol]); // carol은 비공개 → 대기
r = await as(carol, "update follows set follower=$1 where follower=$2 and following=$3", [alice, dave, carol]);
ok("팔로우 당사자를 바꾸려 하면 오류(대기 요청이 있는 상태에서)", !!r.error && /cannot be changed/.test(r.message), r.message);
r = await as(carol, "update follows set status='accepted', following=$1 where follower=$2", [dave, dave]);
ok("승인하면서 받는 사람을 바꾸려 해도 오류", !!r.error, r.message);
await as(dave, "delete from follows where follower=$1 and following=$2", [dave, carol]);
await as(carol, "update profiles set is_private=false where id=$1", [carol]);
ok("비공개→공개로 바꾸면 대기 요청이 자동 승인", (await as(carol, "select count(*)::int c from follows where following=$1 and status='accepted'", [carol])).rows[0].c === 2);
ok("언팔로우", (await as(alice, "delete from follows where follower=$1 and following=$2", [alice, bob])).count === 1);
ok("제3자는 남의 팔로우를 지울 수 없음", (await as(dave, "delete from follows")).count === 0);

// ── 프로필 사진 저장소 ──
ok("내 폴더에 업로드 가능", (await as(alice, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${alice}/a.jpg`])).count === 1);
r = await as(alice, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${bob}/a.jpg`]);
ok("남의 폴더에는 업로드 불가", !!r.error, r.message);
r = await as(alice, "insert into storage.objects (bucket_id, name) values ('other', $1)", [`${alice}/a.jpg`]);
ok("다른 버킷에는 정책이 없어 업로드 불가", !!r.error, r.message);
ok("누구나 사진 조회(공개 버킷)", (await as(null, "select * from storage.objects where bucket_id='avatars'")).rows.length === 1);
ok("남이 내 사진을 지울 수 없음", (await as(bob, "delete from storage.objects where bucket_id='avatars'")).count === 0);
ok("내 사진은 내가 지울 수 있음", (await as(alice, "delete from storage.objects where bucket_id='avatars'")).count === 1);

// ── 게시물(내 피드) ──
const post = (uid, vis = "private", cap = "", path) => as(uid, "insert into posts (author, image_path, caption, visibility) values ($1,$2,$3,$4) returning id", [uid, path ?? `${uid}/${Math.random()}.jpg`, cap, vis]);
const p1 = (await post(alice, "public", "첫 글")).rows[0].id;
const p2 = (await post(alice, "friends")).rows[0].id;
const p3 = (await post(alice, "private")).rows[0].id;
ok("내 게시물 올리기, 새 게시물이 맨 앞", (await as(alice, "select id from posts order by sort_order, created_at desc")).rows.map((x) => x.id).join() === [p3, p2, p1].join());
ok("공개 범위를 안 정하면 거부", !!(await post(alice, "everyone")).error);
ok("남의 폴더 경로로는 올릴 수 없음", !!(await post(alice, "public", "", `${bob}/x.jpg`)).error);
ok("남의 이름으로 올릴 수 없음", !!(await as(alice, "insert into posts (author, image_path, visibility) values ($1,$2,'public')", [bob, `${bob}/x.jpg`])).error);
ok("본문 500자 초과 거부", !!(await post(alice, "public", "가".repeat(501))).error);
ok("남의 게시물은 (공개여도) 읽을 수 없음 — 규칙 미정이라 열지 않음", (await as(bob, "select * from posts")).rows.length === 0 && (await as(null, "select * from posts")).rows.length === 0);
ok("순서 바꾸기", (await as(alice, "select reorder_my_posts($1::uuid[])", [[p1, p3, p2]])).error === undefined && (await as(alice, "select id from posts order by sort_order, created_at desc")).rows.map((x) => x.id).join() === [p1, p3, p2].join());
ok("일부만 담으면 거부", !!(await as(alice, "select reorder_my_posts($1::uuid[])", [[p1, p2]])).error);
ok("중복이 있으면 거부", !!(await as(alice, "select reorder_my_posts($1::uuid[])", [[p1, p1, p2]])).error);
const bp = (await post(bob, "public")).rows[0].id;
ok("남의 게시물 id를 섞으면 거부", !!(await as(alice, "select reorder_my_posts($1::uuid[])", [[p1, p3, bp]])).error);
ok("남의 게시물 순서는 건드릴 수 없음", (await as(alice, "update posts set sort_order=99 where id=$1", [bp])).count === 0);
ok("순서 외 항목(본문)은 수정 불가", (await as(alice, "update posts set caption='x' where id=$1", [p1])).error !== undefined);
ok("공개 범위도 수정 불가", (await as(alice, "update posts set visibility='public' where id=$1", [p2])).error !== undefined);
ok("게시물 삭제 불가(정책 없음)", (await as(alice, "delete from posts")).count === 0);
ok("posts 버킷은 비공개", (await admin.query("select public from storage.buckets where id='posts'")).rows[0].public === false);
ok("내 폴더에 게시물 이미지 업로드", (await as(alice, "insert into storage.objects (bucket_id, name) values ('posts', $1)", [`${alice}/a.jpg`])).count === 1);
ok("남의 폴더에는 업로드 불가", !!(await as(alice, "insert into storage.objects (bucket_id, name) values ('posts', $1)", [`${bob}/a.jpg`])).error);
ok("내 게시물 이미지만 읽을 수 있음", (await as(alice, "select * from storage.objects where bucket_id='posts'")).rows.length === 1 && (await as(bob, "select * from storage.objects where bucket_id='posts'")).rows.length === 0 && (await as(null, "select * from storage.objects where bucket_id='posts'")).rows.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
await admin.end();
await server.stop();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
