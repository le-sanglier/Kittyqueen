-- Security rule tests. Run with: supabase/test/run.sh
\set ON_ERROR_STOP 1
set client_min_messages = notice;
\o /dev/null

-- Seed: admin (A), invited parent (B), stranger (S)
insert into auth.users values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent@example.com'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'stranger@example.com');
insert into public.allowed_emails (email) values ('admin@example.com'), ('parent@example.com');
insert into public.admins values ('admin@example.com');

create or replace function pg_temp.login(uid text, email text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email)::text, false);
$$;

create or replace function pg_temp.expect_fail(q text, label text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    raise notice 'PASS (blocked): %', label;
    return;
  end;
  raise exception 'FAIL: % should have been blocked', label;
end $$;

create or replace function pg_temp.expect_eq(got bigint, want bigint, label text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL: % (got %, want %)', label, got, want; end if;
  raise notice 'PASS: %', label;
end $$;

set role authenticated;

-- ---- Admin sets up household + kitty
select pg_temp.login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin@Example.com');
insert into public.households (id, email, parent_name) values (auth.uid(), 'admin@example.com', 'Queen''s Dad');
insert into public.kids (id, household_id, name) values ('11111111-1111-1111-1111-111111111111', auth.uid(), 'Kitty Queen');
select pg_temp.expect_eq((select count(*) from public.allowed_emails), 2, 'admin sees invite list');
select pg_temp.expect_eq((select public.is_admin()::int), 1, 'admin is admin');

-- ---- Parent B
select pg_temp.login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent@example.com');
insert into public.households (id, email, parent_name) values (auth.uid(), 'parent@example.com', 'Mia''s Mom');
insert into public.kids (id, household_id, name) values ('22222222-2222-2222-2222-222222222222', auth.uid(), 'Mia');
insert into public.messages (room, sender_kid, body) values ('castle', '22222222-2222-2222-2222-222222222222', '  hi kitties!  ');
insert into public.messages (room, sender_kid, body)
  values ('dm:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'secret meow');
select pg_temp.expect_eq((select count(*) from public.messages where body = 'hi kitties!'), 1, 'message body trimmed');
select pg_temp.expect_eq((select count(*) from public.allowed_emails), 0, 'parent cannot see invite list');
select pg_temp.expect_eq((select count(*) from public.households), 1, 'parent sees only own household');
select pg_temp.expect_eq((select count(*) from public.kids), 2, 'parent sees all kitties');
select pg_temp.expect_fail($q$insert into public.messages (room, sender_kid, body) values ('castle', '11111111-1111-1111-1111-111111111111', 'pretending')$q$,
  'posting as someone else''s kitty');
select pg_temp.expect_fail($q$insert into public.allowed_emails (email) values ('friend@example.com')$q$, 'parent adding invites');
select pg_temp.expect_fail($q$insert into public.messages (room, sender_kid, body) values ('dm:22222222-2222-2222-2222-222222222222:11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'x')$q$,
  'unsorted dm room id');
select pg_temp.expect_fail($q$insert into public.messages (room, sender_kid, body) values ('castle', '22222222-2222-2222-2222-222222222222', '   ')$q$, 'blank message');
select pg_temp.expect_fail($q$insert into public.messages (room, sender_kid, body) values ('castle', '22222222-2222-2222-2222-222222222222', repeat('a', 501))$q$, 'too-long message');
select pg_temp.expect_fail($q$insert into public.messages (room, sender_kid, body) values ('lobby', '22222222-2222-2222-2222-222222222222', 'x')$q$, 'unknown room');
select pg_temp.expect_fail($q$insert into public.kids (household_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sneaky')$q$, 'adding kitty to other household');
select pg_temp.expect_fail($q$insert into public.kids (household_id, name) values (auth.uid(), 'kitty queen')$q$, 'duplicate kitty name');
select pg_temp.expect_fail($q$update public.messages set body = 'edited'$q$, 'editing message text');
update public.messages set hidden = true;  -- silently affects 0 rows (not admin)
select pg_temp.expect_eq((select count(*) from public.messages where hidden), 0, 'parent cannot hide messages');
update public.kids set name = 'Queen Imposter' where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.expect_eq((select count(*) from public.kids where name = 'Queen Imposter'), 0, 'parent cannot rename others'' kitty');
insert into public.reactions values (1, '22222222-2222-2222-2222-222222222222', '💖');
select pg_temp.expect_fail($q$insert into public.reactions values (1, '11111111-1111-1111-1111-111111111111', '💖')$q$, 'reacting as other kitty');
select pg_temp.expect_fail($q$insert into public.reactions values (1, '22222222-2222-2222-2222-222222222222', '💩')$q$, 'non-kitty emoji reaction');

-- Spam guard: 15 per minute
do $$ begin
  for i in 1..13 loop
    insert into public.messages (room, sender_kid, body) values ('castle', '22222222-2222-2222-2222-222222222222', 'meow ' || i);
  end loop;
end $$;
select pg_temp.expect_fail($q$insert into public.messages (room, sender_kid, body) values ('castle', '22222222-2222-2222-2222-222222222222', 'one too many')$q$, 'spam guard');

-- ---- Admin reads private chat and hides a message
select pg_temp.login('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@example.com');
select pg_temp.expect_eq((select count(*) from public.messages where room like 'dm:%'), 1, 'grown-up can read private chats');
update public.messages set hidden = true where body = 'secret meow';
select pg_temp.expect_eq((select count(*) from public.messages where hidden), 1, 'admin can hide messages');
select pg_temp.expect_eq((select count(*) from public.room_summaries()), 1, 'room summaries skip hidden');

-- ---- Stranger: signed in but not invited
select pg_temp.login('cccccccc-cccc-cccc-cccc-cccccccccccc', 'stranger@example.com');
select pg_temp.expect_eq((select count(*) from public.messages), 0, 'stranger sees no messages');
select pg_temp.expect_eq((select count(*) from public.kids), 0, 'stranger sees no kitties');
select pg_temp.expect_fail($q$insert into public.households (id, email, parent_name) values (auth.uid(), 'stranger@example.com', 'Stranger')$q$, 'stranger creating household');

-- ---- Signed-out visitor
reset role;
set role anon;
select pg_temp.expect_fail($q$select * from public.messages$q$, 'signed-out visitor reading messages');

-- ---- Removing an invite locks a family out
reset role;
delete from public.allowed_emails where email = 'parent@example.com';
set role authenticated;
select pg_temp.login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'parent@example.com');
select pg_temp.expect_eq((select count(*) from public.messages), 0, 'un-invited parent loses access');

-- ---- Sign-up hook
reset role;
select pg_temp.expect_eq((select (public.hook_only_invited('{"user":{"email":"ADMIN@example.com"}}') = '{}'::jsonb)::int), 1, 'hook allows invited email');
select pg_temp.expect_eq((select (public.hook_only_invited('{"user":{"email":"x@example.com"}}') ? 'error')::int), 1, 'hook blocks uninvited email');

\o
\echo ALL RLS TESTS PASSED
