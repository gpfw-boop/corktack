-- Corktack: shared comments for prototypes.
-- Run this once in the Supabase SQL editor. It is safe to re-run.
--
-- Reviewers have no accounts, so the anon key is public. The anon role can
-- read and add comments directly. Resolving and deleting go through
-- set_resolved() and delete_comment(), which anyone can call, so anyone with
-- the link can tidy up. Nobody can edit a comment's text.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project text not null check (char_length(project) between 1 and 200),
  -- Null for top-level comments. Deleting a comment deletes its replies.
  parent_id uuid null references public.comments (id) on delete cascade,
  route text not null check (char_length(route) between 1 and 1000),
  author text not null check (char_length(btrim(author)) between 1 and 60 and char_length(author) <= 60),
  body text not null check (char_length(btrim(body)) between 1 and 2000 and char_length(body) <= 2000),
  -- Where the pin goes. Null for replies.
  anchor jsonb null check (anchor is null or (jsonb_typeof(anchor) = 'object' and octet_length(anchor::text) <= 4000)),
  viewport_width int null check (viewport_width between 1 and 100000),
  created_at timestamptz not null default now(),
  -- When the thread was marked done. Null while open, and always null for replies.
  resolved_at timestamptz null,
  -- How to reopen what the commenter was looking at: { url, steps }. Null for replies.
  view jsonb null check (view is null or (jsonb_typeof(view) = 'object' and octet_length(view::text) <= 8000)),
  -- Top-level comments are pinned somewhere; replies are not.
  constraint comments_shape check (
    (parent_id is null and anchor is not null)
    or (parent_id is not null and anchor is null and viewport_width is null)
  )
);

-- Upgrades a table made by an earlier version of this script.
alter table public.comments add column if not exists resolved_at timestamptz null;
alter table public.comments add column if not exists view jsonb null
  check (view is null or (jsonb_typeof(view) = 'object' and octet_length(view::text) <= 8000));
alter table public.comments drop column if exists delete_token_hash;
drop function if exists public.delete_comment(uuid, text);
alter table public.comments drop constraint if exists comments_resolved_top_level;
alter table public.comments add constraint comments_resolved_top_level check (parent_id is null or resolved_at is null);
alter table public.comments drop constraint if exists comments_view_top_level;
alter table public.comments add constraint comments_view_top_level check (parent_id is null or view is null);

create index if not exists comments_project_created_at on public.comments (project, created_at);
create index if not exists comments_parent_id on public.comments (parent_id);

-- Only one level of replies, and a reply belongs to the same project as its comment.
create or replace function public.comments_check_reply()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent record;
begin
  if new.parent_id is null then
    return new;
  end if;
  select c.parent_id, c.project into parent from public.comments c where c.id = new.parent_id;
  if not found then
    raise exception 'Parent comment not found';
  end if;
  if parent.parent_id is not null then
    raise exception 'Replies can only be added to top-level comments';
  end if;
  if parent.project <> new.project then
    raise exception 'A reply must be in the same project as its comment';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_check_reply on public.comments;
create trigger comments_check_reply
  before insert on public.comments
  for each row execute function public.comments_check_reply();

-- Row level security: read and add only.
alter table public.comments enable row level security;

drop policy if exists "Anyone can read comments" on public.comments;
create policy "Anyone can read comments"
  on public.comments for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can add comments" on public.comments;
create policy "Anyone can add comments"
  on public.comments for insert
  to anon, authenticated
  with check (true);

-- Column privileges. Clients can't choose an id, created_at or resolved_at.
-- There is no update or delete privilege: those go through the functions below.
revoke all on public.comments from anon, authenticated;
grant select (id, project, parent_id, route, author, body, anchor, viewport_width, created_at, resolved_at, view)
  on public.comments to anon, authenticated;
grant insert (project, parent_id, route, author, body, anchor, viewport_width, view)
  on public.comments to anon, authenticated;

-- Deletes a comment, or a whole thread when given a top-level comment.
-- Returns true if something was deleted.
create or replace function public.delete_comment(comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted integer;
begin
  delete from public.comments where id = comment_id;
  get diagnostics deleted = row_count;
  return deleted > 0;
end;
$$;

-- Marks a thread done, or opens it again. Only top-level comments can be resolved.
-- Returns true if the comment was found.
create or replace function public.set_resolved(comment_id uuid, resolved boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.comments
  set resolved_at = case when resolved then coalesce(resolved_at, now()) end
  where id = comment_id and parent_id is null;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

revoke all on function public.delete_comment(uuid) from public;
revoke all on function public.set_resolved(uuid, boolean) from public;
grant execute on function public.delete_comment(uuid) to anon, authenticated;
grant execute on function public.set_resolved(uuid, boolean) to anon, authenticated;

-- Live updates. Adds the table to Supabase Realtime if it isn't there yet.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
    )
  then
    alter publication supabase_realtime add table public.comments;
  end if;
end;
$$;
