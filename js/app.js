import { api } from './api.js';
import { GROWNUP_CONTACT } from './config.js';
import { kittySVG, FUR, EYES, ACCESSORIES, PATTERNS, DEFAULT_AVATAR, cleanAvatar, randomAvatar } from './kitty.js';
import { startTwinkles, enableTapSparkles, burst } from './sparkle.js';
import { meow, ting, soundOn, setSound } from './sound.js';

// ------------------------------------------------------------------
// Little helpers
// ------------------------------------------------------------------

const $app = document.getElementById('app');

/** Create an element. User text is always added as text, never HTML. */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'svg') el.innerHTML = v; // only ever our own kitty SVG
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (typeof v !== 'string' && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/** Like el.replaceChildren(), but skips empty bits (null/false) and flattens lists. */
function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}

function screen(...children) {
  fill($app, h('main', { class: 'screen' }, ...children));
  window.scrollTo(0, 0);
}

function logo(small = false) {
  return h('div', { class: 'logo' + (small ? ' small' : '') },
    h('span', { class: 'logo-kitty', svg: kittySVG({ fur: 'pink', eyes: 'purple', acc: 'crown' }, small ? 40 : 96) }),
    h('span', { class: 'logo-text' }, 'Kitty Queen'));
}

function toast(text, kind = '') {
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.classList.add('bye'), 3200);
  setTimeout(() => t.remove(), 3800);
}

function friendly(e) {
  const m = String(e?.message || e || '');
  if (/slow down/i.test(m)) return 'Whoa, slow down kitty! 🐾 Try again in a minute.';
  if (/kids_name_unique|duplicate/i.test(m)) return 'That kitty name is taken! Try another one. 😺';
  if (/row-level security|permission/i.test(m)) return "Oops! You're not allowed to do that. 🙀";
  if (/fetch|network|Failed to/i.test(m)) return "Can't reach the Kitty Castle. Check the wifi! 📶";
  if (/token|otp|expired|invalid/i.test(m)) return "That code didn't work. Check it, or send a new one. 💌";
  if (/rate limit/i.test(m)) return 'Too many emails! Wait a few minutes and try again. ⏳';
  return m || 'Something went wrong 🙀';
}

async function busy(btn, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = '✨ ...';
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(`kittyqueen:${S.profile.userId}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function fmtDay(iso) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
const isEmojiOnly = (s) =>
  s.length <= 24 && /\p{Extended_Pictographic}/u.test(s) &&
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Emoji_Modifier}|‍|️|\s)+$/u.test(s);

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------

const S = {
  profile: null,
  kids: [],
  kidsById: new Map(),
  me: null,            // the kitty using this tablet
  view: 'chat',        // 'chat' | 'grown'
  room: 'castle',
  messages: [],
  reactions: new Map(), // message id -> [{ kid_id, emoji }]
  summaries: new Map(), // room -> last_at
  unsub: null,
  ui: {},
  grownTab: 'read',
};

const dmRoom = (a, b) => 'dm:' + [a, b].sort().join(':');
const myKids = () => S.kids.filter((k) => k.household_id === S.profile.userId);
const seenKey = () => 'kq.seen.' + S.me.id;
const REACTIONS = ['💖', '🐾', '✨', '😹', '👑', '🌈'];
const STICKERS = ['😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '🐱', '🐈', '🐈‍⬛', '🐾', '👑', '✨', '💖', '💜', '💗', '🌈',
  '🦄', '⭐', '🌟', '🎀', '🌸', '🦋', '🍕', '🍦', '🧁', '🍩', '🍓', '🎉', '🎨', '⚽', '🎵', '📚', '💤', '👋', '👍', '❤️'];

async function loadKids() {
  S.kids = await api.listKids();
  S.kids.forEach((k) => (k.avatar = cleanAvatar(k.avatar)));
  S.kidsById = new Map(S.kids.map((k) => [k.id, k]));
}

function roomTitle(room, forGrownups = false) {
  if (room === 'castle') return '👑 The Kitty Castle';
  const [, a, b] = room.split(':');
  const ka = S.kidsById.get(a), kb = S.kidsById.get(b);
  if (!forGrownups && S.me) {
    const other = a === S.me.id ? kb : ka;
    return '💌 ' + (other?.name || 'A kitty');
  }
  return `💌 ${ka?.name || '?'} & ${kb?.name || '?'}`;
}

// ------------------------------------------------------------------
// Routing
// ------------------------------------------------------------------

let lastAuthEmail;
async function route() {
  S.unsub?.(); S.unsub = null;
  screen(h('div', { class: 'loading' }, h('span', { class: 'bounce', svg: kittySVG(DEFAULT_AVATAR, 110) }), h('p', {}, 'Loading the sparkles...')));
  try {
    S.profile = await api.me();
  } catch (e) {
    return screen(logo(), h('div', { class: 'card' }, h('p', {}, friendly(e)), h('button', { class: 'btn', onclick: route }, 'Try again')));
  }
  lastAuthEmail = S.profile?.email || null;
  if (!S.profile) return renderLogin();
  if (!S.profile.allowed) return renderNotInvited();
  if (!S.profile.household?.pin_hash) return renderGrownupSetup();
  await loadKids();
  const mine = myKids();
  if (!mine.length) return renderKittyMaker(null, { firstTime: true });
  const saved = store.get('kq.kid');
  const pick = mine.find((k) => k.id === saved) || (mine.length === 1 ? mine[0] : null);
  if (!pick) return renderWhoAreYou();
  return startChatAs(pick);
}

function startChatAs(kid) {
  S.me = kid;
  store.set('kq.kid', kid.id);
  S.view = 'chat';
  if (S.room !== 'castle' && !S.room.includes(kid.id)) S.room = 'castle';
  return openChat();
}

// ------------------------------------------------------------------
// Sign in
// ------------------------------------------------------------------

function renderLogin() {
  const err = h('p', { class: 'error', role: 'alert' });
  const email = h('input', { type: 'email', class: 'big-input', placeholder: 'grownup@email.com', autocomplete: 'email', required: true, 'aria-label': "Grown-up's email" });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Send my magic link ✨');
  const form = h('form', {
    class: 'card stack',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const addr = email.value.trim().toLowerCase();
      try {
        await busy(btn, () => api.sendLoginEmail(addr));
        renderCode(addr);
      } catch (x) { err.textContent = friendly(x); }
    },
  },
  h('h2', {}, 'Grown-ups, sign in here 👋'),
  h('p', { class: 'muted' }, "Type your email and we'll send a magic link and a secret code."),
  email, btn, err);
  screen(logo(), h('p', { class: 'tagline' }, 'A sparkly place for kitties to chat 🐾'), form,
    api.demo && demoNote());
}

function renderCode(addr) {
  const err = h('p', { class: 'error', role: 'alert' });
  const code = h('input', {
    class: 'big-input code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10',
    placeholder: '123456', 'aria-label': 'Code from the email', required: true,
  });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, "Let's go! 🚀");
  screen(logo(),
    h('form', {
      class: 'card stack',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        try {
          await busy(btn, () => api.verifyCode(addr, code.value.replace(/\D/g, '')));
          route();
        } catch (x) { err.textContent = friendly(x); }
      },
    },
    h('h2', {}, 'Check your email! 💌'),
    h('p', {}, 'We sent a message to ', h('b', {}, addr), '.'),
    h('p', { class: 'muted' }, 'Tap the magic link on this tablet, or type the code from the email here:'),
    code, btn, err,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn link', onclick: async (e) => { try { await busy(e.target, () => api.sendLoginEmail(addr)); toast('Sent again! 📬'); } catch (x) { err.textContent = friendly(x); } } }, 'Send it again'),
      h('button', { type: 'button', class: 'btn link', onclick: renderLogin }, 'Use a different email'))),
    api.demo && demoNote('In demo mode, any code works!'));
}

function demoNote(extra = '') {
  return h('p', { class: 'demo-note' }, '🧪 Demo mode: nothing is sent or saved online yet. ', extra);
}

function renderNotInvited() {
  screen(logo(), h('div', { class: 'card stack center-text' },
    h('div', { class: 'big-emoji' }, '🙀'),
    h('h2', {}, 'Not on the kitty list yet!'),
    h('p', {}, h('b', {}, S.profile.email), " isn't invited yet."),
    h('p', { class: 'muted' }, GROWNUP_CONTACT),
    h('button', { class: 'btn', onclick: () => api.signOut().then(route) }, 'Sign out')));
}

// ------------------------------------------------------------------
// Grown-up first-time setup
// ------------------------------------------------------------------

function pinInput(label) {
  return h('input', { class: 'big-input code', type: 'password', inputmode: 'numeric', pattern: '[0-9]{4}', maxlength: '4', required: true, placeholder: '••••', 'aria-label': label, autocomplete: 'off' });
}

function renderGrownupSetup() {
  const err = h('p', { class: 'error', role: 'alert' });
  const name = h('input', { class: 'big-input', maxlength: '40', required: true, placeholder: "e.g. Maya's Mom", value: S.profile.household?.parent_name || '' });
  const pin1 = pinInput('New PIN'), pin2 = pinInput('PIN again');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Next: make a kitty! 🐱');
  screen(logo(), h('form', {
    class: 'card stack',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!/^\d{4}$/.test(pin1.value)) return (err.textContent = 'The PIN needs to be 4 numbers.');
      if (pin1.value !== pin2.value) return (err.textContent = "The two PINs don't match.");
      try {
        await busy(btn, async () => api.saveHousehold({ parent_name: name.value.trim(), pin_hash: await hashPin(pin1.value) }));
        route();
      } catch (x) { err.textContent = friendly(x); }
    },
  },
  h('h2', {}, 'Welcome, grown-up! 👋'),
  h('p', { class: 'muted' }, "A quick setup, then your kid can make their kitty."),
  h('label', {}, 'Your name (other grown-ups will see this)', name),
  h('label', {}, 'Pick a 4-number Grown-up PIN', pin1),
  h('label', {}, 'Type the PIN again', pin2),
  h('p', { class: 'hint' }, "🔒 The PIN opens the Grown-up Corner, where grown-ups can read all the chats and manage kitties. Don't tell the kitties!"),
  btn, err));
}

// ------------------------------------------------------------------
// Make-your-kitty
// ------------------------------------------------------------------

const FUR_NAMES = { pink: 'Pink', lavender: 'Lavender', cream: 'Cream', orange: 'Orange', gray: 'Gray', black: 'Black', white: 'White', mint: 'Mint', sky: 'Sky blue' };
const ACC_NAMES = { crown: 'Crown', tiara: 'Tiara', bow: 'Bow', flower: 'Flower', star: 'Star', headphones: 'Headphones', none: 'Nothing' };
const PATTERN_NAMES = { none: 'Plain', stripes: 'Stripes', spots: 'Spots', patch: 'Patch' };

function renderKittyMaker(kid, { firstTime = false, onDone = null } = {}) {
  let av = cleanAvatar(kid?.avatar || randomAvatar());
  const err = h('p', { class: 'error', role: 'alert' });
  const preview = h('div', { class: 'maker-preview' });
  const options = h('div', { class: 'maker-options' });
  const name = h('input', { class: 'big-input', maxlength: '20', required: true, placeholder: 'Kitty name', value: kid?.name || '', 'aria-label': 'Kitty name' });

  const group = (title, keys, isSel, set, face) =>
    h('fieldset', { class: 'opt-group' }, h('legend', {}, title),
      h('div', { class: 'opts' }, keys.map((key) => face(key, isSel(key), () => { set(key); draw(); }))));

  const swatch = (colors, names) => (key, sel, pick) =>
    h('button', { type: 'button', class: 'swatch' + (sel ? ' sel' : ''), style: `background:${colors[key]}`, 'aria-label': names[key] || key, 'aria-pressed': String(sel), onclick: pick });
  const mini = (patch, names) => (key, sel, pick) =>
    h('button', { type: 'button', class: 'mini' + (sel ? ' sel' : ''), 'aria-pressed': String(sel), onclick: pick },
      h('span', { svg: kittySVG({ ...av, ...patch(key) }, 52) }), h('small', {}, names[key]));

  function draw() {
    fill(preview, h('span', { class: 'wiggle', svg: kittySVG(av, 180) }));
    fill(options, 
      group('Fur color', Object.keys(FUR), (k) => av.fur === k, (k) => (av.fur = k), swatch(FUR, FUR_NAMES)),
      group('Eye color', Object.keys(EYES), (k) => av.eyes === k, (k) => (av.eyes = k), swatch(EYES, {})),
      group('Fancy stuff', ACCESSORIES, (k) => av.acc === k, (k) => (av.acc = k), mini((k) => ({ acc: k }), ACC_NAMES)),
      group('Fur pattern', PATTERNS, (k) => av.pattern === k, (k) => (av.pattern = k), mini((k) => ({ pattern: k }), PATTERN_NAMES)),
    );
  }
  draw();

  const save = h('button', { class: 'btn primary', type: 'submit' }, firstTime ? 'Start chatting! ✨' : 'Save my kitty ✨');
  screen(
    !firstTime && h('button', { class: 'btn link back', onclick: () => (onDone ? onDone() : route()) }, '← Back'),
    h('h1', { class: 'title' }, kid ? 'Change your kitty' : 'Make your kitty! 🎨'),
    h('form', {
      class: 'card maker',
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        const n = name.value.trim();
        if (!n) return (err.textContent = 'Your kitty needs a name!');
        try {
          const saved = await busy(save, () => api.saveKid({ id: kid?.id, name: n, avatar: av }));
          burst(innerWidth / 2, innerHeight / 3, 16);
          if (firstTime) { store.set('kq.kid', saved.id); route(); }
          else if (onDone) { await loadKids(); onDone(); }
          else route();
        } catch (x) { err.textContent = friendly(x); }
      },
    },
    h('div', { class: 'maker-left' }, preview,
      h('button', { type: 'button', class: 'btn', onclick: () => { av = randomAvatar(); draw(); } }, '🎲 Surprise me!'),
      h('label', {}, 'Kitty name', name),
      h('p', { class: 'hint' }, 'Tip: use a fun kitty name — not your whole real name! 😺'),
      save, err),
    options));
}

function renderWhoAreYou() {
  screen(logo(), h('h1', { class: 'title' }, "Who's here? 🐾"),
    h('div', { class: 'who-grid' }, myKids().map((k) =>
      h('button', { class: 'who', onclick: () => startChatAs(k) }, h('span', { svg: kittySVG(k.avatar, 120) }), h('b', {}, k.name)))),
    h('button', { class: 'btn link', onclick: () => openGrownups() }, '🔒 Grown-up Corner'));
}

// ------------------------------------------------------------------
// Chat
// ------------------------------------------------------------------

async function openChat() {
  S.view = 'chat';
  subscribeLive();
  const ui = S.ui = {};
  ui.rooms = h('nav', { class: 'rooms', 'aria-label': 'Chats' });
  ui.head = h('div', { class: 'thread-head' });
  ui.msgs = h('div', { class: 'messages', 'aria-live': 'polite' });
  ui.input = h('input', { class: 'composer-input', maxlength: '500', placeholder: 'Say something sparkly...', 'aria-label': 'Message', enterkeyhint: 'send', autocomplete: 'off' });
  ui.send = h('button', { class: 'send', type: 'submit', 'aria-label': 'Send' }, '🐾');
  ui.stickers = h('div', { class: 'stickers', hidden: true },
    STICKERS.map((s) => h('button', { type: 'button', onclick: () => { ui.input.value += s; ui.input.focus(); } }, s)));
  const sound = h('button', { class: 'icon-btn', 'aria-label': 'Sound on or off', onclick: () => { setSound(!soundOn()); sound.textContent = soundOn() ? '🔔' : '🔕'; if (soundOn()) meow(); } }, soundOn() ? '🔔' : '🔕');

  fill($app, h('div', { class: 'chat' },
    h('header', { class: 'topbar' },
      logo(true),
      h('div', { class: 'spacer' }),
      h('button', { class: 'me-chip', 'aria-label': 'Switch kitty', onclick: () => (myKids().length > 1 ? renderWhoAreYou() : toast(`You're ${S.me.name}! 😺`)) },
        h('span', { svg: kittySVG(S.me.avatar, 34) }), h('b', {}, S.me.name)),
      sound,
      h('button', { class: 'icon-btn', 'aria-label': 'Grown-up Corner', onclick: () => openGrownups() }, '🔒')),
    ui.rooms,
    h('section', { class: 'thread' }, ui.head, ui.msgs,
      h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); sendNow(); } },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Stickers', onclick: () => (ui.stickers.hidden = !ui.stickers.hidden) }, '😺'),
        ui.input, ui.send),
      ui.stickers)));
  await refreshSummaries();
  await openRoom(S.room);
}

function renderRooms() {
  if (S.view !== 'chat' || !S.ui.rooms) return;
  const seen = store.get(seenKey(), {});
  const btn = (room, avatarSvg, label, sub) => {
    const last = S.summaries.get(room);
    const unread = last && room !== S.room && (!seen[room] || last > seen[room]);
    return h('button', { class: 'room' + (room === S.room ? ' on' : ''), onclick: () => openRoom(room) },
      h('span', { class: 'room-pic', svg: avatarSvg }),
      h('span', { class: 'room-label' }, h('b', {}, label), sub && h('small', {}, sub)),
      unread && h('span', { class: 'dot', 'aria-label': 'new messages' }));
  };
  const friends = S.kids.filter((k) => k.id !== S.me.id);
  fill(S.ui.rooms, 
    btn('castle', `<span class="castle-pic">🏰</span>`, 'Kitty Castle', 'Everyone!'),
    h('div', { class: 'rooms-title' }, 'Private chats'),
    ...(friends.length ? friends.map((k) => btn(dmRoom(S.me.id, k.id), kittySVG(k.avatar, 40), k.name))
      : [h('p', { class: 'muted small' }, 'No other kitties yet!')]));
}

async function refreshSummaries() {
  try {
    const rows = await api.roomSummaries();
    S.summaries = new Map(rows.map((r) => [r.room, r.last_at]));
  } catch {}
  renderRooms();
}

function markSeen() {
  if (S.view !== 'chat') return;
  const seen = store.get(seenKey(), {});
  const last = S.messages.at(-1)?.created_at || new Date().toISOString();
  seen[S.room] = last;
  store.set(seenKey(), seen);
}

async function openRoom(room) {
  S.room = room;
  S.messages = [];
  if (S.view === 'chat') {
    S.ui.stickers.hidden = true;
    renderRooms();
  }
  fill(S.ui.head, h('h2', {}, roomTitle(room, S.view === 'grown')),
    S.view === 'chat' && room === 'castle' ? h('small', {}, 'The group chat for all the kitties') : null);
  fill(S.ui.msgs, h('p', { class: 'muted center-text' }, 'Loading... 🐾'));
  try {
    const list = await api.listMessages(room, { limit: S.view === 'grown' ? 200 : 80 });
    if (S.room !== room) return;
    S.messages = list;
    const reacts = await api.listReactions(list.map((m) => m.id));
    S.reactions = new Map();
    reacts.forEach((r) => applyReaction(r, true));
    if (list.some((m) => !S.kidsById.has(m.sender_kid))) await loadKids();
  } catch (e) {
    fill(S.ui.msgs, h('p', { class: 'error center-text' }, friendly(e)));
    return;
  }
  renderMessages(true);
  markSeen();
  renderRooms();
}

function applyReaction(r, on) {
  const list = S.reactions.get(r.message_id) || [];
  const i = list.findIndex((x) => x.kid_id === r.kid_id && x.emoji === r.emoji);
  if (on && i < 0) list.push({ kid_id: r.kid_id, emoji: r.emoji });
  if (!on && i >= 0) list.splice(i, 1);
  S.reactions.set(r.message_id, list);
}

function renderMessages(forceBottom = false) {
  const box = S.ui.msgs;
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const grown = S.view === 'grown';
  const list = grown ? S.messages : S.messages.filter((m) => !m.hidden);
  const out = [];
  let prev = null;
  for (const m of list) {
    if (!prev || fmtDay(prev.created_at) !== fmtDay(m.created_at)) out.push(h('div', { class: 'day' }, h('span', {}, fmtDay(m.created_at))));
    const first = !prev || prev.sender_kid !== m.sender_kid || new Date(m.created_at) - new Date(prev.created_at) > 5 * 60e3 || out.at(-1)?.classList.contains('day');
    out.push(messageEl(m, first));
    prev = m;
  }
  if (!list.length) {
    out.push(h('div', { class: 'empty' }, h('div', { class: 'big-emoji' }, '🐾'),
      h('p', {}, grown ? 'No messages here.' : 'No messages yet — say hi! 👋')));
  }
  fill(box, ...out);
  if (forceBottom || nearBottom) box.scrollTop = box.scrollHeight;
}

function messageEl(m, first) {
  const grown = S.view === 'grown';
  const kid = S.kidsById.get(m.sender_kid);
  const mine = !grown && m.sender_kid === S.me?.id;
  const bubble = h('div', { class: 'bubble' + (isEmojiOnly(m.body) ? ' emoji' : '') }, m.body);
  const row = h('div', { class: `msg${mine ? ' mine' : ''}${first ? ' first' : ''}${m.hidden ? ' hidden-msg' : ''}`, 'data-id': String(m.id) },
    h('div', { class: 'msg-avatar', svg: first ? kittySVG(kid?.avatar, 42) : '' }),
    h('div', { class: 'msg-body' },
      first && h('div', { class: 'msg-name' }, h('b', {}, kid?.name || 'Mystery Kitty'), ' ', h('time', {}, fmtTime(m.created_at))),
      bubble,
      reactionsEl(m),
      grown && m.hidden && h('div', { class: 'hidden-label' }, '🙈 Hidden from kitties'),
      grown && S.profile.isAdmin && h('button', { class: 'btn link tiny', onclick: () => hideMessage(m) }, m.hidden ? 'Un-hide' : 'Hide from kitties')));
  if (!grown) bubble.addEventListener('click', () => toggleReactBar(row, m));
  return row;
}

function reactionsEl(m) {
  const list = S.reactions.get(m.id) || [];
  if (!list.length) return null;
  const by = new Map();
  list.forEach((r) => by.set(r.emoji, [...(by.get(r.emoji) || []), r.kid_id]));
  return h('div', { class: 'reacts' }, [...by].map(([emoji, kidIds]) => {
    const mineToo = S.view === 'chat' && kidIds.includes(S.me.id);
    const names = kidIds.map((id) => S.kidsById.get(id)?.name || 'A kitty').join(', ');
    return h('button', {
      class: 'react' + (mineToo ? ' mine' : ''), title: names, 'aria-label': `${emoji} from ${names}`,
      disabled: S.view !== 'chat',
      onclick: (e) => { e.stopPropagation(); react(m, emoji); },
    }, emoji, ' ', h('small', {}, kidIds.length));
  }));
}

function toggleReactBar(row, m) {
  const open = row.querySelector('.react-bar');
  document.querySelectorAll('.react-bar').forEach((b) => b.remove());
  if (open) return;
  const bar = h('div', { class: 'react-bar' }, REACTIONS.map((e) =>
    h('button', { 'aria-label': 'React ' + e, onclick: (ev) => { ev.stopPropagation(); bar.remove(); react(m, e, ev); } }, e)));
  row.querySelector('.msg-body').append(bar);
}

async function react(m, emoji, ev) {
  const has = (S.reactions.get(m.id) || []).some((r) => r.kid_id === S.me.id && r.emoji === emoji);
  const row = { message_id: m.id, kid_id: S.me.id, emoji };
  applyReaction(row, !has);
  renderMessages();
  if (!has && ev) burst(ev.clientX, ev.clientY, 6);
  try {
    await api.setReaction(m.id, S.me.id, emoji, !has);
  } catch (e) {
    applyReaction(row, has);
    renderMessages();
    toast(friendly(e), 'bad');
  }
}

async function sendNow() {
  const body = S.ui.input.value.trim();
  if (!body) return;
  S.ui.input.value = '';
  S.ui.stickers.hidden = true;
  try {
    const m = await api.sendMessage(S.room, S.me.id, body);
    addMessage(m);
    ting();
    const r = S.ui.send.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 10);
  } catch (e) {
    if (!S.ui.input.value) S.ui.input.value = body;
    toast(friendly(e), 'bad');
  }
}

function addMessage(m) {
  if (m.room !== S.room || S.messages.some((x) => x.id === m.id)) return;
  S.messages.push(m);
  S.summaries.set(m.room, m.created_at);
  renderMessages(m.sender_kid === S.me?.id);
  markSeen();
}

// ------------------------------------------------------------------
// Live updates
// ------------------------------------------------------------------

function subscribeLive() {
  S.unsub?.();
  S.unsub = api.subscribe({
    onMessage: async (m) => {
      if (!S.kidsById.has(m.sender_kid)) { await loadKids(); renderRooms(); }
      const prevLast = S.summaries.get(m.room);
      if (!prevLast || m.created_at > prevLast) S.summaries.set(m.room, m.created_at);
      const fromMe = S.me && m.sender_kid === S.me.id;
      if (m.room === S.room) addMessage(m);
      if (S.view === 'chat') {
        const forMe = m.room === 'castle' || m.room.includes(S.me.id);
        if (forMe && !fromMe) meow();
        renderRooms();
      }
    },
    onMessageUpdate: (m) => {
      const i = S.messages.findIndex((x) => x.id === m.id);
      if (i >= 0) { S.messages[i] = { ...S.messages[i], ...m }; renderMessages(); }
    },
    onReaction: (r, on) => {
      if (!S.messages.some((m) => m.id === r.message_id)) return;
      applyReaction(r, on);
      renderMessages();
    },
  });
}

// Tablets go to sleep; catch up when we wake.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.ui.msgs || !S.me) return;
  refreshSummaries();
  openRoom(S.room);
});

// ------------------------------------------------------------------
// Grown-up Corner
// ------------------------------------------------------------------

let grownUnlockedUntil = 0;

function openGrownups() {
  if (Date.now() < grownUnlockedUntil) return renderGrownups();
  const err = h('p', { class: 'error', role: 'alert' });
  const pin = pinInput('Grown-up PIN');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Unlock 🔓');
  screen(
    h('button', { class: 'btn link back', onclick: backToKids }, '← Back'),
    h('form', {
      class: 'card stack center-text',
      onsubmit: async (e) => {
        e.preventDefault();
        if ((await hashPin(pin.value)) === S.profile.household.pin_hash) {
          grownUnlockedUntil = Date.now() + 10 * 60e3;
          renderGrownups();
        } else {
          err.textContent = 'Nope! That is not the PIN. 🙅';
          pin.value = '';
          pin.focus();
        }
      },
    },
    h('div', { class: 'big-emoji' }, '🔒'),
    h('h2', {}, 'Grown-ups only!'),
    h('p', { class: 'muted' }, 'Type your 4-number Grown-up PIN.'),
    pin, btn, err,
    h('button', { type: 'button', class: 'btn link', onclick: forgotPin }, 'Forgot the PIN?')));
  pin.focus();
}

async function forgotPin() {
  const addr = S.profile.email;
  try {
    await api.sendLoginEmail(addr);
  } catch (x) { return toast(friendly(x), 'bad'); }
  const err = h('p', { class: 'error', role: 'alert' });
  const code = h('input', { class: 'big-input code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', placeholder: '123456', required: true, 'aria-label': 'Code from the email' });
  screen(h('form', {
    class: 'card stack',
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        await api.verifyCode(addr, code.value.replace(/\D/g, ''));
        S.profile.household.pin_hash = null;
        renderGrownupSetup();
      } catch (x) { err.textContent = friendly(x); }
    },
  },
  h('h2', {}, 'Reset your PIN 💌'),
  h('p', {}, 'We emailed a code to ', h('b', {}, addr), '. Type it here, then pick a new PIN.'),
  code, h('button', { class: 'btn primary', type: 'submit' }, 'Next'), err,
  h('button', { type: 'button', class: 'btn link', onclick: openGrownups }, 'Cancel')));
}

function backToKids() {
  if (S.me) startChatAs(S.kidsById.get(S.me.id) || S.me);
  else route();
}

async function renderGrownups() {
  S.view = 'grown';
  subscribeLive();
  const tabs = [
    ['read', '📖 Read chats'],
    ['kitties', '🐱 Our kitties'],
    ...(S.profile.isAdmin ? [['invites', '💌 Invite list'], ['families', '🏠 Families']] : []),
    ['settings', '⚙️ Settings'],
  ];
  const body = h('div', { class: 'grown-body' });
  fill($app, h('div', { class: 'grown' },
    h('header', { class: 'topbar' },
      h('button', { class: 'btn link', onclick: () => { grownUnlockedUntil = 0; backToKids(); } }, '← Back to kitties'),
      h('div', { class: 'spacer' }),
      h('h1', { class: 'grown-title' }, 'Grown-up Corner')),
    h('nav', { class: 'tabs', role: 'tablist' }, tabs.map(([id, label]) =>
      h('button', { role: 'tab', 'aria-selected': String(S.grownTab === id), class: 'tab' + (S.grownTab === id ? ' on' : ''), onclick: () => { S.grownTab = id; renderGrownups(); } }, label))),
    body));
  const tab = { read: grownRead, kitties: grownKitties, invites: grownInvites, families: grownFamilies, settings: grownSettings }[S.grownTab] || grownRead;
  try {
    await tab(body);
  } catch (e) {
    fill(body, h('p', { class: 'error' }, friendly(e)));
  }
}

async function grownRead(body) {
  await loadKids();
  await refreshSummaries();
  const rooms = [...S.summaries].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([room]) => room);
  if (!rooms.includes('castle')) rooms.unshift('castle');
  if (!rooms.includes(S.room)) S.room = 'castle';
  S.ui = { msgs: h('div', { class: 'messages' }), head: h('div', { class: 'thread-head' }) };
  const list = h('div', { class: 'grown-rooms' }, rooms.map((room) =>
    h('button', { class: 'room' + (room === S.room ? ' on' : ''), onclick: (e) => { list.querySelectorAll('.room').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); openRoom(room); } },
      h('span', { class: 'room-label' }, h('b', {}, roomTitle(room, true)),
        S.summaries.get(room) && h('small', {}, 'Last message: ' + fmtDay(S.summaries.get(room)) + ' ' + fmtTime(S.summaries.get(room)))))));
  fill(body, 
    h('p', { class: 'muted' }, 'Every grown-up in Kitty Queen can read every chat, including private ones.' +
      (S.profile.isAdmin ? ' As an admin you can hide a message from the kitties.' : '')),
    h('div', { class: 'grown-read' }, list, h('section', { class: 'thread' }, S.ui.head, S.ui.msgs)));
  await openRoom(S.room);
}

async function hideMessage(m) {
  try {
    await api.setHidden(m.id, !m.hidden);
    m.hidden = !m.hidden;
    renderMessages();
  } catch (e) { toast(friendly(e), 'bad'); }
}

async function grownKitties(body) {
  await loadKids();
  const mine = myKids();
  fill(body, 
    h('div', { class: 'kitty-list' }, mine.map((k) => h('div', { class: 'card kitty-card' },
      h('span', { svg: kittySVG(k.avatar, 90) }), h('b', {}, k.name),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => renderKittyMaker(k, { onDone: renderGrownups }) }, '✏️ Change'),
        h('button', {
          class: 'btn danger', onclick: async () => {
            if (!confirm(`Remove ${k.name}? Their messages will be deleted too.`)) return;
            try { await api.deleteKid(k.id); if (S.me?.id === k.id) { S.me = null; store.del('kq.kid'); } renderGrownups(); } catch (e) { toast(friendly(e), 'bad'); }
          },
        }, 'Remove'))))),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => renderKittyMaker(null, { onDone: renderGrownups }) }, '➕ Add another kitty'),
      mine.length > 1 && h('button', { class: 'btn', onclick: () => { grownUnlockedUntil = 0; renderWhoAreYou(); } }, "🔁 Switch who's on this tablet")));
}

async function grownInvites(body) {
  const rows = await api.listInvites();
  const err = h('p', { class: 'error', role: 'alert' });
  const email = h('input', { class: 'big-input', type: 'email', required: true, placeholder: 'friend.grownup@email.com', 'aria-label': 'Email to invite' });
  const note = h('input', { class: 'big-input', maxlength: '60', placeholder: "Note, e.g. Luna's dad", 'aria-label': 'Note' });
  const add = h('button', { class: 'btn primary', type: 'submit' }, 'Invite 💌');
  fill(body, 
    h('form', {
      class: 'card stack',
      onsubmit: async (e) => {
        e.preventDefault();
        try { await busy(add, () => api.addInvite(email.value, note.value.trim())); toast('Invited! 🎉'); renderGrownups(); } catch (x) { err.textContent = friendly(x); }
      },
    },
    h('h2', {}, 'Invite a family'),
    h('p', { class: 'muted' }, 'Add a grown-up\'s email. Then they go to kittyqueen.club on their kid\'s tablet and sign in with that email.'),
    email, note, add, err),
    h('h2', {}, `On the list (${rows.length})`),
    h('ul', { class: 'invite-list' }, rows.map((r) => h('li', {},
      h('span', {}, h('b', {}, r.email), r.note ? ` — ${r.note}` : ''),
      r.email !== S.profile.email.toLowerCase() && h('button', {
        class: 'btn link danger', onclick: async () => {
          if (!confirm(`Remove ${r.email}? That family won't be able to see or send messages anymore.`)) return;
          try { await api.removeInvite(r.email); renderGrownups(); } catch (x) { toast(friendly(x), 'bad'); }
        },
      }, 'Remove')))));
}

async function grownFamilies(body) {
  const [homes] = await Promise.all([api.listHouseholds(), loadKids()]);
  fill(body, h('ul', { class: 'invite-list' }, homes.map((home) => h('li', {},
    h('span', {}, h('b', {}, home.parent_name), ` (${home.email})`),
    h('span', { class: 'family-kids' }, S.kids.filter((k) => k.household_id === home.id).map((k) =>
      h('span', { class: 'tag' }, h('span', { svg: kittySVG(k.avatar, 24) }), k.name)))))));
}

function grownSettings(body) {
  const err = h('p', { class: 'error', role: 'alert' });
  const name = h('input', { class: 'big-input', maxlength: '40', required: true, value: S.profile.household.parent_name });
  const pin1 = pinInput('New PIN (optional)'); pin1.required = false;
  const save = h('button', { class: 'btn primary', type: 'submit' }, 'Save');
  fill(body, 
    h('form', {
      class: 'card stack',
      onsubmit: async (e) => {
        e.preventDefault();
        if (pin1.value && !/^\d{4}$/.test(pin1.value)) return (err.textContent = 'The PIN needs to be 4 numbers.');
        try {
          const pin_hash = pin1.value ? await hashPin(pin1.value) : undefined;
          S.profile.household = await busy(save, () => api.saveHousehold({ parent_name: name.value.trim(), pin_hash }));
          toast('Saved! ✨');
          pin1.value = '';
        } catch (x) { err.textContent = friendly(x); }
      },
    },
    h('h2', {}, 'Your grown-up info'),
    h('p', { class: 'muted' }, 'Signed in as ', h('b', {}, S.profile.email)),
    h('label', {}, 'Your name', name),
    h('label', {}, 'Change PIN (leave blank to keep it)', pin1),
    save, err),
    h('div', { class: 'card stack' },
      h('h2', {}, 'Sign out'),
      h('p', { class: 'muted' }, 'After signing out, you\'ll need your email to sign in again on this tablet.'),
      h('button', { class: 'btn danger', onclick: async () => { store.del('kq.kid'); S.me = null; await api.signOut(); route(); } }, 'Sign out of this tablet')),
    api.demo && h('div', { class: 'card stack' },
      h('h2', {}, 'Demo mode'),
      h('button', { class: 'btn', onclick: () => { api.resetDemo(); store.del('kq.kid'); location.reload(); } }, 'Reset the demo')));
}

// ------------------------------------------------------------------
// Go!
// ------------------------------------------------------------------

startTwinkles();
enableTapSparkles();
api.onAuthChange((session) => {
  const e = session?.email || null;
  if (lastAuthEmail !== undefined && e !== lastAuthEmail) {
    lastAuthEmail = e;
    setTimeout(route, 0);
  }
});
route();
