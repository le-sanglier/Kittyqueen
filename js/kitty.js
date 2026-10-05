// Make-your-own-kitty avatars, drawn as SVG.
// Avatars are stored as small objects of *keys* (never raw colors/markup),
// e.g. { fur: 'pink', eyes: 'green', acc: 'crown', pattern: 'stripes' }.

export const FUR = {
  pink:     '#ffb3d9',
  lavender: '#c9b3ff',
  cream:    '#ffe9c2',
  orange:   '#ffb066',
  gray:     '#b9c0cc',
  black:    '#4a4458',
  white:    '#fbf8ff',
  mint:     '#a8f0d1',
  sky:      '#a8d8ff',
};
export const EYES = {
  green: '#3ecf6a',
  blue:  '#3b9bff',
  gold:  '#f5b800',
  pink:  '#ff4fa3',
  purple:'#9b5cff',
};
export const ACCESSORIES = ['crown', 'bow', 'flower', 'star', 'tiara', 'headphones', 'none'];
export const PATTERNS = ['none', 'stripes', 'spots', 'patch'];

export const DEFAULT_AVATAR = { fur: 'pink', eyes: 'green', acc: 'crown', pattern: 'none' };

const pick = (obj, key, fallback) => (Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : obj[fallback]);
const oneOf = (list, v, fallback) => (list.includes(v) ? v : fallback);

export function cleanAvatar(a = {}) {
  return {
    fur: Object.hasOwn(FUR, a.fur) ? a.fur : DEFAULT_AVATAR.fur,
    eyes: Object.hasOwn(EYES, a.eyes) ? a.eyes : DEFAULT_AVATAR.eyes,
    acc: oneOf(ACCESSORIES, a.acc, 'none'),
    pattern: oneOf(PATTERNS, a.pattern, 'none'),
  };
}

export function randomAvatar() {
  const r = (list) => list[Math.floor(Math.random() * list.length)];
  return { fur: r(Object.keys(FUR)), eyes: r(Object.keys(EYES)), acc: r(ACCESSORIES), pattern: r(PATTERNS) };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  const r = c(n >> 16), g = c((n >> 8) & 255), b = c(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

let uid = 0;

/** Returns an SVG string for the given avatar (keys are validated). */
export function kittySVG(avatar, size = 64) {
  const a = cleanAvatar(avatar);
  const fur = pick(FUR, a.fur, 'pink');
  const dark = shade(fur, -45);
  const eye = pick(EYES, a.eyes, 'green');
  const isDark = a.fur === 'black';
  const line = isDark ? '#fbe3ff' : '#5a3d5c';
  const id = `k${++uid}`;

  let pattern = '';
  if (a.pattern === 'stripes') {
    pattern = `<g fill="${dark}" opacity=".55" clip-path="url(#${id}h)">
      <path d="M50 30 l4 14 l4 -14z"/><path d="M38 34 l5 11 l2 -12z"/><path d="M62 34 l-5 11 l-2 -12z"/>
      <path d="M18 60 l12 3 l-12 4z"/><path d="M82 60 l-12 3 l12 4z"/></g>`;
  } else if (a.pattern === 'spots') {
    pattern = `<g fill="${dark}" opacity=".5" clip-path="url(#${id}h)">
      <circle cx="30" cy="44" r="5"/><circle cx="72" cy="40" r="4"/><circle cx="76" cy="72" r="5"/><circle cx="24" cy="74" r="3.5"/></g>`;
  } else if (a.pattern === 'patch') {
    pattern = `<g fill="${dark}" opacity=".55" clip-path="url(#${id}h)"><ellipse cx="68" cy="50" rx="15" ry="13"/></g>`;
  }

  const acc = {
    crown: `<g transform="translate(50 15)"><path d="M-17 8 L-17 -6 L-9 1 L0 -11 L9 1 L17 -6 L17 8 Z" fill="#ffd34d" stroke="#e0a800" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="0" cy="-11" r="2.6" fill="#ff6fb5"/><circle cx="-17" cy="-6" r="2.2" fill="#7ad7ff"/><circle cx="17" cy="-6" r="2.2" fill="#7ad7ff"/><circle cx="0" cy="3" r="2.4" fill="#ff6fb5"/></g>`,
    tiara: `<g transform="translate(50 22)"><path d="M-18 4 Q0 -10 18 4" fill="none" stroke="#e8e8ff" stroke-width="3"/>
      <path d="M0 -12 L3 -5 L0 -2 L-3 -5Z" fill="#9fe7ff" stroke="#fff" stroke-width=".8"/><circle cx="-10" cy="-2" r="2" fill="#ffb3e6"/><circle cx="10" cy="-2" r="2" fill="#ffb3e6"/></g>`,
    bow: `<g transform="translate(70 22) rotate(18)"><path d="M0 0 L-13 -9 Q-16 0 -13 9 Z" fill="#ff5fa8"/><path d="M0 0 L13 -9 Q16 0 13 9 Z" fill="#ff5fa8"/>
      <circle r="4" fill="#ff8cc4"/></g>`,
    flower: `<g transform="translate(30 24)">${[0, 72, 144, 216, 288].map((r) => `<ellipse rx="4.5" ry="7" transform="rotate(${r}) translate(0 -6)" fill="#fff6a8" stroke="#ffcf3a" stroke-width=".8"/>`).join('')}
      <circle r="4" fill="#ff9a3c"/></g>`,
    star: `<g transform="translate(72 20) rotate(12)"><path d="M0 -10 L2.9 -3.1 L10 -3.1 L4.3 1.4 L6.4 8.5 L0 4.3 L-6.4 8.5 L-4.3 1.4 L-10 -3.1 L-2.9 -3.1Z" fill="#ffe14d" stroke="#f0b400" stroke-width="1"/></g>`,
    headphones: `<g><path d="M17 56 Q17 18 50 18 Q83 18 83 56" fill="none" stroke="#7a5cff" stroke-width="5" stroke-linecap="round"/>
      <rect x="9" y="50" width="12" height="18" rx="5" fill="#a58bff"/><rect x="79" y="50" width="12" height="18" rx="5" fill="#a58bff"/></g>`,
    none: '',
  }[a.acc];

  return `<svg class="kitty" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <defs><clipPath id="${id}h"><ellipse cx="50" cy="58" rx="36" ry="32"/></clipPath></defs>
  <path d="M18 46 L20 12 L44 30 Z" fill="${fur}" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M82 46 L80 12 L56 30 Z" fill="${fur}" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M23 38 L24 20 L37 30 Z" fill="#ff9fcb"/><path d="M77 38 L76 20 L63 30 Z" fill="#ff9fcb"/>
  <ellipse cx="50" cy="58" rx="36" ry="32" fill="${fur}" stroke="${line}" stroke-width="2.5"/>
  ${pattern}
  <ellipse cx="36" cy="55" rx="7" ry="8.5" fill="${eye}"/><ellipse cx="64" cy="55" rx="7" ry="8.5" fill="${eye}"/>
  <ellipse cx="36" cy="56" rx="3" ry="6" fill="#2a1f33"/><ellipse cx="64" cy="56" rx="3" ry="6" fill="#2a1f33"/>
  <circle cx="38.5" cy="51.5" r="2.4" fill="#fff"/><circle cx="66.5" cy="51.5" r="2.4" fill="#fff"/>
  <circle cx="34" cy="59" r="1" fill="#fff"/><circle cx="62" cy="59" r="1" fill="#fff"/>
  <ellipse cx="25" cy="68" rx="6" ry="3.5" fill="#ff8cc4" opacity=".55"/><ellipse cx="75" cy="68" rx="6" ry="3.5" fill="#ff8cc4" opacity=".55"/>
  <path d="M46.5 66 L53.5 66 L50 70 Z" fill="#ff6fa8"/>
  <path d="M50 70 Q50 75 45 75 M50 70 Q50 75 55 75" fill="none" stroke="${line}" stroke-width="2" stroke-linecap="round"/>
  <g stroke="${line}" stroke-width="1.6" stroke-linecap="round" opacity=".7">
    <path d="M14 63 L30 66"/><path d="M15 71 L30 70"/><path d="M86 63 L70 66"/><path d="M85 71 L70 70"/></g>
  ${acc}
</svg>`;
}
