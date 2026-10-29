-- 댓글 기능(post_comments)을 만드는 마이그레이션. Supabase 대시보드 > SQL Editor에 전체를 붙여 넣고 Run 한다.
-- 여러 번 실행해도 안전하다. 선행 조건: posts, profiles 테이블(schema.sql)이 이미 있어야 한다.

-- 댓글. 게시물 전체에 다는 글이다.
--  · "이 게시물을 읽을 수 있는 사람"만 읽고 쓸 수 있다(posts의 읽기 규칙을 그대로 따른다).
--  · 본인 댓글만 수정·삭제할 수 있다. 삭제는 행을 완전히 지운다(기록을 남기지 않는다).
--  · 게시물이나 계정이 지워지면 댓글도 함께 지워진다(on delete cascade).
--  · 예전 버전(author/body/deleted_at 컬럼)의 테이블이 남아 있으면 지우고 새로 만든다. 그 테이블에 있던 댓글은 사라진다.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'post_comments' and column_name = 'author') then
    drop table public.post_comments cascade;
  end if;
end $$;

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);
create index if not exists post_comments_created_idx on public.post_comments (created_at);

alter table public.post_comments enable row level security;

drop policy if exists "read comments of readable posts" on public.post_comments;
create policy "read comments of readable posts" on public.post_comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists "comment on a readable post" on public.post_comments;
create policy "comment on a readable post" on public.post_comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));

drop policy if exists "edit my comment" on public.post_comments;
create policy "edit my comment" on public.post_comments for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete my comment" on public.post_comments;
create policy "delete my comment" on public.post_comments for delete to authenticated
  using (user_id = auth.uid());

-- 바꿀 수 있는 것은 내용(content)뿐이다. updated_at은 서버 시각으로 채운다.
create or replace function public.post_comments_guard() returns trigger
language plpgsql as $$
begin
  if new.id <> old.id or new.post_id <> old.post_id or new.user_id <> old.user_id
     or new.created_at <> old.created_at then
    raise exception 'only content can be edited' using errcode = '42501';
  end if;
  new.updated_at := case when new.content <> old.content then now() else old.updated_at end;
  return new;
end $$;
drop trigger if exists post_comments_guard on public.post_comments;
create trigger post_comments_guard before update on public.post_comments
  for each row execute function public.post_comments_guard();

-- 새 댓글이 새로고침 없이 알림 점에 반영되도록 Realtime에 등록한다.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_comments') then
    alter publication supabase_realtime add table public.post_comments;
  end if;
end $$;

notify pgrst, 'reload schema';
