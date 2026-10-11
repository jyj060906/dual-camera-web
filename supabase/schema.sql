-- 듀얼 카메라: 계정·프로필·친구·팔로우 스키마
-- Supabase 대시보드 > SQL Editor에 붙여 넣어 실행한다. 여러 번 실행해도 안전하다.
--
-- 로그인은 "아이디 + 비밀번호"만 쓴다. Supabase Auth는 이메일 형식의 식별자가 필요해서
-- 아이디 `abc`를 `abc@id.dual-camera.example`로 바꿔 넣는다(실제 메일은 보내지 않는다).
-- 그래서 Auth 설정에서 "Confirm email"을 꺼야 한다. (README의 설정 안내 참고)

-- ───────────────────────── 프로필 ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,                                  -- 아이디. 구글·카카오로 처음 들어온 사람은 정할 때까지 비어 있다.
  nickname text not null default '',
  bio text not null default '',
  avatar_url text,
  is_private boolean not null default false,      -- 비공개 계정이면 팔로우에 승인이 필요하다.
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{4,20}$'),
  constraint profiles_nickname_len check (char_length(nickname) <= 30),
  constraint profiles_bio_len check (char_length(bio) <= 200)
);

-- 프로필 사진 주소는 http(s)만 허용한다(javascript: 같은 주소 차단). 로컬 개발은 http라서 http도 허용한다.
alter table public.profiles drop constraint if exists profiles_avatar_https;
alter table public.profiles drop constraint if exists profiles_avatar_url_scheme;
alter table public.profiles add constraint profiles_avatar_url_scheme
  check (avatar_url is null or avatar_url ~ '^https?://');

create unique index if not exists profiles_username_key on public.profiles (username);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users"
  on public.profiles for select to authenticated using (true);

-- 프로필 행은 가입할 때 아래 트리거가 만들고, 본인 것만 고칠 수 있다(행을 직접 만들거나 지울 수는 없다).
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 아이디는 한 번 정하면 바꿀 수 없고, id는 바꿀 수 없다.
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if new.id <> old.id then
    raise exception 'profile id cannot be changed';
  end if;
  if old.username is not null and new.username is distinct from old.username then
    raise exception 'username cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- 비공개 → 공개로 바꾸면 승인 대기 중이던 팔로우를 모두 승인한 것으로 바꾼다.
create or replace function public.profiles_privacy_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_private and not new.is_private then
    update public.follows set status = 'accepted'
      where following = new.id and status = 'pending';
  end if;
  return new;
end $$;

-- 가입하면 프로필을 만든다. 아이디/비밀번호 가입은 이메일에서 아이디를 꺼내 쓰고(클라이언트가 보낸 값은 믿지 않는다),
-- 구글·카카오는 아이디를 비워 둔다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uname text;
begin
  if new.email like '%@id.dual-camera.example' then
    uname := lower(split_part(new.email, '@', 1));
  end if;
  insert into public.profiles (id, username, nickname, avatar_url)
  values (
    new.id,
    uname,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      uname,
      ''
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    )
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 가입 전에 아이디가 비어 있는지 확인한다(로그인 전이라 anon도 부를 수 있다).
create or replace function public.username_available(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where username = lower(name));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ───────────────────────── 친구 (서로 수락한 관계) ─────────────────────────
create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- 두 사람 사이에는 요청·친구 관계가 한 줄만 있을 수 있다(A→B와 B→A를 동시에 만들 수 없다).
create unique index if not exists friendships_pair_key
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;

drop policy if exists "friendships visible to the two people" on public.friendships;
create policy "friendships visible to the two people"
  on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));

drop policy if exists "send friend request" on public.friendships;
create policy "send friend request"
  on public.friendships for insert to authenticated
  with check (requester = auth.uid() and status = 'pending');

-- 받은 사람만 수락할 수 있다.
drop policy if exists "accept friend request" on public.friendships;
create policy "accept friend request"
  on public.friendships for update to authenticated
  using (addressee = auth.uid() and status = 'pending')
  with check (addressee = auth.uid() and status = 'accepted');

-- 거절·취소·친구 끊기: 둘 중 누구든 지울 수 있다.
drop policy if exists "remove friendship" on public.friendships;
create policy "remove friendship"
  on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));

create or replace function public.friendships_guard() returns trigger
language plpgsql as $$
begin
  if new.requester <> old.requester or new.addressee <> old.addressee then
    raise exception 'friendship parties cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists friendships_guard on public.friendships;
create trigger friendships_guard before update on public.friendships
  for each row execute function public.friendships_guard();

-- ───────────────────────── 팔로우 (한쪽이 구독하는 관계) ─────────────────────────
create table if not exists public.follows (
  follower uuid not null references auth.users (id) on delete cascade,
  following uuid not null references auth.users (id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower, following),
  check (follower <> following)
);

create index if not exists follows_following_idx on public.follows (following);

alter table public.follows enable row level security;

-- 승인된 팔로우는 누구나 센다(팔로워·팔로잉 수 표시). 대기 중인 요청은 당사자만 본다.
drop policy if exists "follows readable" on public.follows;
create policy "follows readable"
  on public.follows for select to authenticated
  using (status = 'accepted' or auth.uid() in (follower, following));

drop policy if exists "follow someone" on public.follows;
create policy "follow someone"
  on public.follows for insert to authenticated
  with check (follower = auth.uid());

-- 팔로우를 받는 사람만 대기 중인 요청을 승인할 수 있다.
drop policy if exists "approve follow request" on public.follows;
create policy "approve follow request"
  on public.follows for update to authenticated
  using (following = auth.uid() and status = 'pending')
  with check (following = auth.uid() and status = 'accepted');

-- 언팔로우·요청 취소·거절·팔로워 삭제
drop policy if exists "remove follow" on public.follows;
create policy "remove follow"
  on public.follows for delete to authenticated
  using (auth.uid() in (follower, following));

-- 상태는 클라이언트가 정하지 못하게 서버에서 정한다: 비공개 계정이면 승인 대기, 아니면 바로 승인.
create or replace function public.follows_set_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := case
    when exists (select 1 from public.profiles p where p.id = new.following and p.is_private)
    then 'pending' else 'accepted' end;
  return new;
end $$;

drop trigger if exists follows_set_status on public.follows;
create trigger follows_set_status before insert on public.follows
  for each row execute function public.follows_set_status();

create or replace function public.follows_guard() returns trigger
language plpgsql as $$
begin
  if new.follower <> old.follower or new.following <> old.following then
    raise exception 'follow parties cannot be changed';
  end if;
  return new;
end $$;

drop trigger if exists follows_guard on public.follows;
create trigger follows_guard before update on public.follows
  for each row execute function public.follows_guard();

-- (follows 테이블이 만들어진 뒤에 연결한다)
drop trigger if exists profiles_privacy_changed on public.profiles;
create trigger profiles_privacy_changed after update of is_private on public.profiles
  for each row execute function public.profiles_privacy_changed();

-- ───────────────────────── 프로필 사진 저장소 ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public"
  on storage.objects for select using (bucket_id = 'avatars');

-- 파일은 본인 폴더(avatars/<내 id>/...)에만 올리고 고치고 지울 수 있다.
drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "update own avatar" on storage.objects;
create policy "update own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "delete own avatar" on storage.objects;
create policy "delete own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────────── 게시물(내 피드) ─────────────────────────
-- 합성이 끝난 듀얼샷 한 장(두 사진 + 프레임이 이미 합쳐진 이미지)을 게시물 하나로 저장한다.
-- 아직 정하지 않은 것(다른 사람이 보는 범위, 순서 적용 화면, 수정·삭제 규칙)은 규칙을 만들지 않았다.
--  · 읽기: 본인 것만. 친구·팔로워가 보는 규칙은 공개 범위 우선순위가 정해진 뒤에 추가한다.
--  · 삭제: 정책 없음(삭제 후 기록 보관 방식이 정해지지 않았다).
--  · 수정: 순서(sort_order)만 가능. 그 밖의 항목은 수정 허용 범위가 정해질 때까지 막아 둔다.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references public.profiles (id) on delete cascade,
  image_path text not null check (char_length(image_path) between 1 and 300),
  caption text not null default '' check (char_length(caption) <= 500),
  visibility text not null check (visibility in ('public', 'friends', 'private')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists posts_author_order_idx on public.posts (author, sort_order, created_at desc);

alter table public.posts enable row level security;

drop policy if exists "read own posts" on public.posts;
create policy "read own posts" on public.posts for select to authenticated
  using (author = auth.uid());

drop policy if exists "create own posts" on public.posts;
create policy "create own posts" on public.posts for insert to authenticated
  with check (author = auth.uid() and image_path like auth.uid()::text || '/%');

drop policy if exists "reorder own posts" on public.posts;
create policy "reorder own posts" on public.posts for update to authenticated
  using (author = auth.uid()) with check (author = auth.uid());

create or replace function public.posts_guard() returns trigger
language plpgsql as $$
begin
  if new.id <> old.id or new.author <> old.author or new.image_path <> old.image_path
     or new.caption <> old.caption or new.visibility <> old.visibility
     or new.created_at <> old.created_at then
    raise exception 'only sort_order can be changed' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists posts_guard on public.posts;
create trigger posts_guard before update on public.posts
  for each row execute function public.posts_guard();

-- 새 게시물은 맨 앞(가장 작은 순서보다 앞)에 놓는다. 기본 정렬은 확정 전이라 임시 값이다.
create or replace function public.posts_default_order() returns trigger
language plpgsql as $$
begin
  select coalesce(min(sort_order), 0) - 1 into new.sort_order from public.posts where author = new.author;
  return new;
end $$;
drop trigger if exists posts_default_order on public.posts;
create trigger posts_default_order before insert on public.posts
  for each row execute function public.posts_default_order();

-- 내 게시물 순서를 한 번에 바꾼다. ids의 앞쪽이 먼저 보인다. 내 게시물 전체를 정확히 한 번씩 담아야 한다.
create or replace function public.reorder_my_posts(ids uuid[]) returns void
language plpgsql security invoker as $$
declare mine integer;
begin
  select count(*) into mine from public.posts where author = auth.uid();
  if mine <> coalesce(array_length(ids, 1), 0)
     or (select count(distinct x) from unnest(ids) x) <> mine
     or exists (select 1 from unnest(ids) x where x not in (select id from public.posts where author = auth.uid())) then
    raise exception 'ids must list each of my posts exactly once' using errcode = '22023';
  end if;
  update public.posts p set sort_order = o.ord - 1
    from unnest(ids) with ordinality as o(id, ord)
    where p.id = o.id and p.author = auth.uid();
end $$;
grant execute on function public.reorder_my_posts(uuid[]) to authenticated;

-- 게시물 이미지: 비공개 저장소. 본인 폴더(posts/<내 id>/...)만 올리고 읽을 수 있다(서명된 주소로 보여 준다).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "read own post images" on storage.objects;
create policy "read own post images"
  on storage.objects for select to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "upload own post images" on storage.objects;
create policy "upload own post images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);
