-- =====================================================================
--  Kitty Queen 👑🐱  —  database setup for Supabase
--
--  Paste this whole file into Supabase → SQL Editor → "Run".
--  It is safe to run again later (it only adds what is missing).
--
--  How access works:
--    * A grown-up signs in with their email (magic link / 6-digit code).
--    * They can only see or do ANYTHING if their email is on the
--      invite list (public.allowed_emails). Remove an email and that
--      family is locked out immediately.
--    * Every invited grown-up can read every chat (group + private).
--    * Kids post as "kitties" that belong to their grown-up's account.
--    * Admins (public.admins) manage the invite list and can hide messages.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table if not exists public.allowed_emails (
  email      text primary key check (email = lower(email)),
  note       text,                       -- e.g. "Maya's mom"
  added_at   timestamptz not null default now()
);

create table if not exists public.admins (
  email      text primary key check (email = lower(email))
);

-- One row per signed-in grown-up account ("household").
create table if not exists public.households (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  parent_name  text not null check (char_length(parent_name) between 1 and 40),
  pin_hash     text,                     -- hashed Grown-up Corner PIN
  created_at   timestamptz not null default now()
);

-- Each kid is a "kitty" that belongs to a household.
create table if not exists public.kids (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 20),
  avatar        jsonb not null default '{}'::jsonb check (pg_column_size(avatar) < 600),
  created_at    timestamptz not null default now()
);
create unique index if not exists kids_name_unique on public.kids (lower(btrim(name)));

-- room is either 'castle' (the group chat) or 'dm:<kidA>:<kidB>'
-- with the two kid ids sorted, for a private chat.
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  room        text not null check (
                room = 'castle'
                or (room ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'
                    and split_part(room, ':', 2) collate "C" < split_part(room, ':', 3) collate "C")),
  sender_kid  uuid not null references public.kids (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists messages_room_time on public.messages (room, created_at desc);

create table if not exists public.reactions (
  message_id  bigint not null references public.messages (id) on delete cascade,
  kid_id      uuid   not null references public.kids (id) on delete cascade,
  emoji       text   not null check (emoji in ('💖','🐾','✨','😹','👑','🌈')),
  created_at  timestamptz not null default now(),
  primary key (message_id, kid_id, emoji)
);

-- ---------- Helper functions -----------------------------------------

create or replace function public.my_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- Is the signed-in grown-up on the invite list?
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_emails where email = public.my_email())
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member()
     and exists (select 1 from public.admins where email = public.my_email())
$$;

-- Does this kitty belong to the signed-in grown-up?
create or replace function public.owns_kid(kid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.kids where id = kid and household_id = auth.uid())
$$;

-- ---------- Row level security ---------------------------------------

alter table public.allowed_emails enable row level security;
alter table public.admins         enable row level security;
alter table public.households     enable row level security;
alter table public.kids           enable row level security;
alter table public.messages       enable row level security;
alter table public.reactions      enable row level security;

-- Invite list: only admins can see/change it.
drop policy if exists "admins manage invites" on public.allowed_emails;
create policy "admins manage invites" on public.allowed_emails
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins see admins" on public.admins;
create policy "admins see admins" on public.admins
  for select to authenticated using (public.is_admin());

-- Households: you see/edit your own; admins see all.
drop policy if exists "see own household" on public.households;
create policy "see own household" on public.households
  for select to authenticated
  using (public.is_member() and (id = auth.uid() or public.is_admin()));

drop policy if exists "create own household" on public.households;
create policy "create own household" on public.households
  for insert to authenticated
  with check (public.is_member() and id = auth.uid() and lower(email) = public.my_email());

drop policy if exists "edit own household" on public.households;
create policy "edit own household" on public.households
  for update to authenticated
  using (public.is_member() and id = auth.uid())
  with check (id = auth.uid() and lower(email) = public.my_email());

-- Kitties: every member can see all kitties; you manage your own.
drop policy if exists "members see kitties" on public.kids;
create policy "members see kitties" on public.kids
  for select to authenticated using (public.is_member());

drop policy if exists "add own kitties" on public.kids;
create policy "add own kitties" on public.kids
  for insert to authenticated
  with check (public.is_member() and household_id = auth.uid());

drop policy if exists "edit own kitties" on public.kids;
create policy "edit own kitties" on public.kids
  for update to authenticated
  using (public.is_member() and household_id = auth.uid())
  with check (household_id = auth.uid());

drop policy if exists "remove kitties" on public.kids;
create policy "remove kitties" on public.kids
  for delete to authenticated
  using (public.is_member() and (household_id = auth.uid() or public.is_admin()));

-- Messages: every member (grown-up) can read every chat.
drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_member());

-- You may only post as your own kitty, and only into the group chat
-- or a private chat that your kitty is part of.
drop policy if exists "post as own kitty" on public.messages;
create policy "post as own kitty" on public.messages
  for insert to authenticated
  with check (
    public.is_member()
    and public.owns_kid(sender_kid)
    and hidden = false
    and (room = 'castle' or position(sender_kid::text in room) > 0)
  );

-- Only admins can hide a message (update the "hidden" flag).
drop policy if exists "admins hide messages" on public.messages;
create policy "admins hide messages" on public.messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Reactions
drop policy if exists "members read reactions" on public.reactions;
create policy "members read reactions" on public.reactions
  for select to authenticated using (public.is_member());

drop policy if exists "react as own kitty" on public.reactions;
create policy "react as own kitty" on public.reactions
  for insert to authenticated
  with check (public.is_member() and public.owns_kid(kid_id));

drop policy if exists "unreact as own kitty" on public.reactions;
create policy "unreact as own kitty" on public.reactions
  for delete to authenticated
  using (public.is_member() and public.owns_kid(kid_id));

-- Only let admins change these columns on messages (no editing text).
revoke update on public.messages from authenticated;
grant  update (hidden) on public.messages to authenticated;

-- Nothing at all for signed-out visitors.
revoke all on all tables in schema public from anon;

-- ---------- Guard rails ----------------------------------------------

-- Gentle anti-spam: max 15 messages per kitty per minute.
create or replace function public.slow_down_kitty() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.messages
       where sender_kid = new.sender_kid
         and created_at > now() - interval '1 minute') >= 15 then
    raise exception 'Whoa, slow down kitty! 🐾 Try again in a minute.';
  end if;
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end $$;

drop trigger if exists slow_down_kitty on public.messages;
create trigger slow_down_kitty before insert on public.messages
  for each row execute function public.slow_down_kitty();

-- A list of every chat room with its latest activity (used for the
-- room list and unread dots). Runs with the caller's permissions.
create or replace function public.room_summaries()
returns table (room text, last_at timestamptz, message_count bigint)
language sql stable security invoker set search_path = public as $$
  select room, max(created_at), count(*)
    from public.messages
   where not hidden
   group by room
$$;

-- ---------- Live updates (Supabase Realtime) -------------------------

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'reactions') then
    alter publication supabase_realtime add table public.reactions;
  end if;
end $$;

-- ---------- Optional: block sign-ups from un-invited emails ----------
-- Without this, a stranger can still request a login email, but they
-- will see nothing (every table above checks the invite list).
-- To turn it on: Supabase → Authentication → Hooks →
-- "Before User Created" → Postgres function → public.hook_only_invited
create or replace function public.hook_only_invited(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.allowed_emails
              where email = lower(event -> 'user' ->> 'email')) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This email is not on the Kitty Queen invite list yet.'));
end $$;
grant execute on function public.hook_only_invited(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_only_invited(jsonb) from authenticated, anon, public;

-- =====================================================================
--  LAST STEP — make yourself the admin (run once, with YOUR email):
--
--    insert into public.allowed_emails (email, note) values ('you@example.com', 'Kitty Queen''s grown-up');
--    insert into public.admins (email) values ('you@example.com');
--
--  After that you can invite the other families from the website's
--  Grown-up Corner → "Invite list".
-- =====================================================================
