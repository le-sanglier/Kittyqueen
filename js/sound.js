// Tiny synthesized sounds (no audio files needed).

let ctx = null;
const KEY = 'kq.sound';

export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSound(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Browsers only allow sound after a tap, so warm up on the first one.
document.addEventListener('pointerdown', () => { if (soundOn()) audio(); }, { once: true });

/** A little "mew": a quick pitch swoop up then down. */
export function meow() {
  if (!soundOn()) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  osc.type = 'sawtooth';
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1200, t);
  filter.Q.value = 3;
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.12);
  osc.frequency.exponentialRampToValueAtTime(480, t + 0.38);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.45);
}

/** A sparkly "ting" when you send. */
export function ting() {
  if (!soundOn()) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [1318, 1760, 2093].forEach((f, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    const s = t + i * 0.06;
    gain.gain.setValueAtTime(0.0001, s);
    gain.gain.exponentialRampToValueAtTime(0.12, s + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.3);
    osc.connect(gain).connect(ac.destination);
    osc.start(s);
    osc.stop(s + 0.32);
  });
}
