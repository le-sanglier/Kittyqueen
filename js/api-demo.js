// DEMO backend: everything lives in this browser's localStorage.
// Used automatically until Supabase keys are put in js/config.js.
// Other tabs of the same browser see new messages live.

export const demo = true;

const KEY = 'kq.demo.v1';
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('kq-demo') : null;
const listeners = new Set();
const ME = 'demo-household';

const FRIENDS = [
  { id: 'f0000000-0000-4000-8000-000000000001', household_id: 'h1', name: 'Luna', avatar: { fur: 'lavender', eyes: 'gold', acc: 'star', pattern: 'none' } },
  { id: 'f0000000-0000-4000-8000-000000000002', household_id: 'h2', name: 'Mochi', avatar: { fur: 'cream', eyes: 'blue', acc: 'bow', pattern: 'patch' } },
  { id: 'f0000000-0000-4000-8000-000000000003', household_id: 'h3', name: 'Pixie', avatar: { fur: 'black', eyes: 'green', acc: 'flower', pattern: 'none' } },
  { id: 'f0000000-0000-4000-8000-000000000004', household_id: 'h4', name: 'Tiger Lily', avatar: { fur: 'orange', eyes: 'gold', acc: 'headphones', pattern: 'stripes' } },
];
const REPLIES = ['meow meow!! 😺', 'that is SO cute 💖', 'hehe 😹', 'yesss ✨✨', 'purrrr 🐾', 'i love that!!', 'who wants to play tag at recess?', 'OMG 👑', '🌈🌈🌈'];

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  if (!s) {
    const t = Date.now();
    s = {
      session: null,
      household: null,
      kids: [...FRIENDS],
      nextId: 4,
      messages: [
        { id: 1, room: 'castle', sender_kid: FRIENDS[0].id, body: 'Welcome to the Kitty Castle!! 👑✨', hidden: false, created_at: new Date(t - 3600e3).toISOString() },
        { id: 2, room: 'castle', sender_kid: FRIENDS[1].id, body: 'meow! 😺', hidden: false, created_at: new Date(t - 3500e3).toISOString() },
        { id: 3, room: 'castle', sender_kid: FRIENDS[2].id, body: 'i made my kitty purple tomorrow i think 💜', hidden: false, created_at: new Date(t - 3400e3).toISOString() },
      ],
      reactions: [{ message_id: 1, kid_id: FRIENDS[1].id, emoji: '💖' }, { message_id: 1, kid_id: FRIENDS[2].id, emoji: '💖' }],
      invites: [{ email: 'you@example.com', note: 'Demo admin', added_at: new Date(t).toISOString() }],
    };
    save(s);
  }
  return s;
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}
function emit(evt) {
  listeners.forEach((l) => l(evt));
  bc?.postMessage(evt);
}
bc && (bc.onmessage = (e) => listeners.forEach((l) => l(e.data)));
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

let authCb = null;
export async function getSession() { return load().session; }
export function onAuthChange(cb) { authCb = cb; }
export async function sendLoginEmail() { await wait(400); }
export async function verifyCode(email) {
  const s = load();
  s.session = { email: email.toLowerCase(), userId: ME };
  save(s);
  authCb?.(s.session);
}
export async function signOut() {
  const s = load();
  s.session = null;
  save(s);
  authCb?.(null);
}
export async function me() {
  const s = load();
  if (!s.session) return null;
  return { ...s.session, allowed: true, isAdmin: true, household: s.household };
}
export async function saveHousehold({ parent_name, pin_hash }) {
  const s = load();
  s.household = { id: ME, email: s.session.email, parent_name, pin_hash: pin_hash || s.household?.pin_hash || null };
  save(s);
  return s.household;
}
export async function listKids() {
  return [...load().kids].sort((a, b) => a.name.localeCompare(b.name));
}
export async function saveKid({ id, name, avatar }) {
  const s = load();
  const clash = s.kids.find((k) => k.name.trim().toLowerCase() === name.trim().toLowerCase() && k.id !== id);
  if (clash) throw new Error('duplicate key value violates unique constraint "kids_name_unique"');
  let kid = s.kids.find((k) => k.id === id);
  if (kid) Object.assign(kid, { name, avatar });
  else s.kids.push((kid = { id: crypto.randomUUID(), household_id: ME, name, avatar }));
  save(s);
  return kid;
}
export async function deleteKid(id) {
  const s = load();
  s.kids = s.kids.filter((k) => k.id !== id);
  save(s);
}
export async function listMessages(room, { limit = 60 } = {}) {
  await wait();
  return load().messages.filter((m) => m.room === room).slice(-limit);
}

function insertMessage(room, kidId, body) {
  const s = load();
  const msg = { id: ++s.nextId, room, sender_kid: kidId, body: body.trim(), hidden: false, created_at: new Date().toISOString() };
  s.messages.push(msg);
  save(s);
  emit({ type: 'message', row: msg });
  return msg;
}

export async function sendMessage(room, kidId, body) {
  if (!body.trim()) throw new Error('Empty message');
  const msg = insertMessage(room, kidId, body);
  // Pretend friends write back sometimes, so the demo feels alive.
  const isDM = room.startsWith('dm:');
  const friend = isDM ? FRIENDS.find((f) => room.includes(f.id)) : FRIENDS[Math.floor(Math.random() * FRIENDS.length)];
  if (friend && (isDM || Math.random() < 0.6)) {
    setTimeout(() => insertMessage(room, friend.id, REPLIES[Math.floor(Math.random() * REPLIES.length)]), 1500 + Math.random() * 2000);
  }
  return msg;
}
export async function roomSummaries() {
  const map = new Map();
  for (const m of load().messages) {
    if (m.hidden) continue;
    const r = map.get(m.room) || { room: m.room, last_at: m.created_at, message_count: 0 };
    r.message_count++;
    if (m.created_at > r.last_at) r.last_at = m.created_at;
    map.set(m.room, r);
  }
  return [...map.values()];
}
export async function listReactions(ids) {
  const set = new Set(ids);
  return load().reactions.filter((r) => set.has(r.message_id));
}
export async function setReaction(message_id, kid_id, emoji, on) {
  const s = load();
  const i = s.reactions.findIndex((r) => r.message_id === message_id && r.kid_id === kid_id && r.emoji === emoji);
  const row = { message_id, kid_id, emoji };
  if (on && i < 0) s.reactions.push(row);
  if (!on && i >= 0) s.reactions.splice(i, 1);
  save(s);
  emit({ type: 'reaction', row, on });
}
export function subscribe({ onMessage, onMessageUpdate, onReaction }) {
  const l = (e) => {
    if (e.type === 'message') onMessage?.(e.row);
    if (e.type === 'update') onMessageUpdate?.(e.row);
    if (e.type === 'reaction') onReaction?.(e.row, e.on);
  };
  listeners.add(l);
  return () => listeners.delete(l);
}

export async function listInvites() { return load().invites; }
export async function addInvite(email, note) {
  const s = load();
  const e = email.trim().toLowerCase();
  if (s.invites.some((i) => i.email === e)) throw new Error('That email is already on the list');
  s.invites.push({ email: e, note: note || null, added_at: new Date().toISOString() });
  save(s);
}
export async function removeInvite(email) {
  const s = load();
  s.invites = s.invites.filter((i) => i.email !== email);
  save(s);
}
export async function listHouseholds() {
  const s = load();
  return s.household ? [s.household] : [];
}
export async function setHidden(id, hidden) {
  const s = load();
  const m = s.messages.find((x) => x.id === id);
  if (m) { m.hidden = hidden; save(s); emit({ type: 'update', row: m }); }
}

export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch {}
}
