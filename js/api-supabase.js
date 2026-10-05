// Real backend: Supabase (auth by email magic link / 6-digit code).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const must = ({ data, error }) => {
  if (error) throw new Error(error.message || 'Something went wrong');
  return data;
};

export const demo = false;

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session ? { email: data.session.user.email, userId: data.session.user.id } : null;
}

export function onAuthChange(cb) {
  sb.auth.onAuthStateChange((_event, session) =>
    cb(session ? { email: session.user.email, userId: session.user.id } : null));
}

export async function sendLoginEmail(email) {
  must(await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  }));
}

export async function verifyCode(email, token) {
  must(await sb.auth.verifyOtp({ email, token, type: 'email' }));
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function me() {
  const session = await getSession();
  if (!session) return null;
  const [member, admin] = await Promise.all([sb.rpc('is_member'), sb.rpc('is_admin')]);
  const allowed = !!must(member);
  let household = null;
  if (allowed) {
    household = must(await sb.from('households').select('*').eq('id', session.userId).maybeSingle());
  }
  return { ...session, allowed, isAdmin: !!must(admin), household };
}

export async function saveHousehold({ parent_name, pin_hash }) {
  const s = await getSession();
  const row = { id: s.userId, email: s.email.toLowerCase(), parent_name };
  if (pin_hash) row.pin_hash = pin_hash;
  return must(await sb.from('households').upsert(row).select().single());
}

export async function listKids() {
  return must(await sb.from('kids').select('id, household_id, name, avatar').order('name'));
}

export async function saveKid({ id, name, avatar }) {
  const s = await getSession();
  const row = { name, avatar, household_id: s.userId };
  const q = id ? sb.from('kids').update(row).eq('id', id) : sb.from('kids').insert(row);
  const data = must(await q.select('id, household_id, name, avatar').single());
  return data;
}

export async function deleteKid(id) {
  must(await sb.from('kids').delete().eq('id', id));
}

export async function listMessages(room, { limit = 60 } = {}) {
  const rows = must(await sb.from('messages')
    .select('id, room, sender_kid, body, hidden, created_at')
    .eq('room', room).order('created_at', { ascending: false }).limit(limit));
  return rows.reverse();
}

export async function sendMessage(room, kidId, body) {
  return must(await sb.from('messages').insert({ room, sender_kid: kidId, body }).select().single());
}

export async function roomSummaries() {
  return must(await sb.rpc('room_summaries'));
}

export async function listReactions(messageIds) {
  if (!messageIds.length) return [];
  return must(await sb.from('reactions').select('message_id, kid_id, emoji').in('message_id', messageIds));
}

export async function setReaction(messageId, kidId, emoji, on) {
  if (on) {
    must(await sb.from('reactions').upsert({ message_id: messageId, kid_id: kidId, emoji }, { ignoreDuplicates: true }));
  } else {
    must(await sb.from('reactions').delete().match({ message_id: messageId, kid_id: kidId, emoji }));
  }
}

let channelCount = 0;
export function subscribe({ onMessage, onMessageUpdate, onReaction, onKids }) {
  const ch = sb.channel('kitty-live-' + ++channelCount)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => onMessage?.(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => onMessageUpdate?.(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (p) => onReaction?.(p.new, true))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, (p) => onReaction?.(p.old, false))
    .subscribe();
  return () => sb.removeChannel(ch);
}

// ---- Admin ----
export async function listInvites() {
  return must(await sb.from('allowed_emails').select('*').order('added_at'));
}
export async function addInvite(email, note) {
  must(await sb.from('allowed_emails').insert({ email: email.trim().toLowerCase(), note: note || null }));
}
export async function removeInvite(email) {
  must(await sb.from('allowed_emails').delete().eq('email', email));
}
export async function listHouseholds() {
  return must(await sb.from('households').select('id, email, parent_name, created_at').order('created_at'));
}
export async function setHidden(messageId, hidden) {
  must(await sb.from('messages').update({ hidden }).eq('id', messageId));
}
