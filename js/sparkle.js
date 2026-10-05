// Twinkling background stars + a sparkle burst wherever you tap.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPARKS = ['✨', '⭐', '💖', '🐾', '💫', '🌟'];

export function startTwinkles(container = document.body, count = 28) {
  const layer = document.createElement('div');
  layer.className = 'twinkles';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.textContent = i % 3 === 0 ? '✦' : '✧';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.fontSize = 8 + Math.random() * 16 + 'px';
    s.style.animationDelay = -Math.random() * 4 + 's';
    s.style.animationDuration = 2.5 + Math.random() * 3 + 's';
    layer.appendChild(s);
  }
  container.prepend(layer);
}

export function burst(x, y, n = 8) {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = SPARKS[Math.floor(Math.random() * SPARKS.length)];
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const dist = 40 + Math.random() * 50;
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    document.body.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }
}

export function enableTapSparkles() {
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, textarea')) return;
    burst(e.clientX, e.clientY, 6);
  });
}
