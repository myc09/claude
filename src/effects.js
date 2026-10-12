// Effekte: fallende Sakura-Blüten, Funken beim Tippen, Combo-Zähler, Konfetti und XP/Level.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- Sakura ----------------

export class Sakura {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sakura';
    document.body.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.petals = [];
    this.running = false;
    this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.enabled && this.start()));
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.max = Math.round(Math.min(34, (this.w * this.h) / 38000));
  }

  spawn(top = false) {
    return {
      x: Math.random() * this.w,
      y: top ? -20 : Math.random() * this.h,
      r: 4 + Math.random() * 5,
      vy: 0.35 + Math.random() * 0.6,
      vx: -0.2 + Math.random() * 0.5,
      rot: Math.random() * Math.PI * 2,
      vr: -0.02 + Math.random() * 0.04,
      sway: Math.random() * Math.PI * 2,
      flip: Math.random() * Math.PI * 2,
    };
  }

  setEnabled(on) {
    this.enabled = on && !reduceMotion;
    this.canvas.style.display = this.enabled ? '' : 'none';
    this.enabled ? this.start() : this.stop();
  }

  start() {
    if (this.running) return;
    this.running = true;
    while (this.petals.length < this.max) this.petals.push(this.spawn());
    const tick = () => {
      if (!this.running) return;
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  // Für Level-ups: kurz ein Blütensturm
  storm() {
    for (let i = 0; i < 40; i++) this.petals.push({ ...this.spawn(true), y: -Math.random() * 200, vy: 1.5 + Math.random() * 2, vx: 0.5 + Math.random() * 1.5 });
  }

  draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--petal').trim() || '#ffb7d5';
    for (let i = this.petals.length - 1; i >= 0; i--) {
      const p = this.petals[i];
      p.sway += 0.015;
      p.flip += 0.03;
      p.x += p.vx + Math.sin(p.sway) * 0.4;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > h + 20 || p.x > w + 20 || p.x < -20) {
        if (this.petals.length > this.max) { this.petals.splice(i, 1); continue; }
        Object.assign(p, this.spawn(true));
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.flip)) * 0.7 + 0.3);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.75;
      // Blütenblatt mit kleiner Kerbe
      ctx.beginPath();
      ctx.moveTo(0, -p.r);
      ctx.bezierCurveTo(p.r, -p.r, p.r, p.r * 0.6, 0, p.r);
      ctx.bezierCurveTo(-p.r, p.r * 0.6, -p.r, -p.r, 0, -p.r);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(-p.r * 0.25, -p.r * 0.2, p.r * 0.2, p.r * 0.45, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ---------------- Partikel ----------------

const layer = (() => {
  const el = document.createElement('div');
  el.className = 'fx-layer';
  document.body.appendChild(el);
  return el;
})();

const SPARKS = ['✦', '✧', '★', '♡', '✿', '⋆', '♪'];

function particle(x, y, { chars = SPARKS, spread = 40, rise = 30, size = 14, life = 700, colors } = {}) {
  const el = document.createElement('span');
  el.className = 'fx-spark';
  el.textContent = chars[Math.floor(Math.random() * chars.length)];
  const pal = colors || ['var(--accent)', 'var(--accent-2)', 'var(--accent-3)'];
  el.style.color = pal[Math.floor(Math.random() * pal.length)];
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.fontSize = size * (0.7 + Math.random() * 0.6) + 'px';
  layer.appendChild(el);
  const dx = (Math.random() - 0.5) * spread * 2;
  const dy = -rise - Math.random() * rise;
  el.animate([
    { transform: 'translate(-50%, -50%) scale(.4) rotate(0deg)', opacity: 1 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${(Math.random() - 0.5) * 180}deg)`, opacity: 0 },
  ], { duration: life * (0.7 + Math.random() * 0.6), easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => el.remove();
}

export const fx = {
  enabled: true,

  typing(x, y, combo) {
    if (!this.enabled || reduceMotion || layer.childElementCount > 60) return;
    const n = combo > 50 ? 3 : combo > 20 ? 2 : 1;
    for (let i = 0; i < n; i++) particle(x, y, { spread: 18 + combo / 4, rise: 14 + combo / 5, size: 11 + Math.min(combo, 60) / 10, life: 600 });
  },

  burst(el, count = 14) {
    if (!this.enabled || reduceMotion) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < count; i++) particle(r.left + r.width / 2, r.top + r.height / 2, { spread: 70, rise: 50, size: 16, life: 900 });
  },

  confetti() {
    if (!this.enabled || reduceMotion) return;
    for (let i = 0; i < 46; i++) {
      setTimeout(() => particle(Math.random() * innerWidth, innerHeight * (0.35 + Math.random() * 0.3), {
        chars: ['★', '✦', '♡', '✿', '●', '▲'], spread: 120, rise: 160, size: 18, life: 1500,
      }), i * 12);
    }
  },

  shake() {
    if (!this.enabled || reduceMotion) return;
    document.querySelector('.editor-wrap')?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }],
      { duration: 320 });
  },
};

// ---------------- Combo ----------------

export class Combo {
  constructor(parent, onMilestone) {
    this.el = document.createElement('div');
    this.el.className = 'combo';
    parent.appendChild(this.el);
    this.count = 0;
    this.onMilestone = onMilestone;
  }

  hit() {
    this.count++;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reset(), 2200);
    if (this.count < 5) return this.count;
    const tier = this.count >= 100 ? 'legend' : this.count >= 50 ? 'fire' : this.count >= 20 ? 'hot' : '';
    this.el.className = 'combo show ' + tier;
    this.el.innerHTML = `<b>${this.count}</b><span>COMBO${this.count >= 100 ? ' 神' : this.count >= 50 ? ' 🔥' : '!'}</span>`;
    this.el.animate([{ transform: 'scale(1.35) rotate(-4deg)' }, { transform: 'scale(1) rotate(0)' }], { duration: 180, easing: 'ease-out' });
    if ([25, 50, 100, 200, 500].includes(this.count)) this.onMilestone?.(this.count);
    return this.count;
  }

  reset() {
    this.count = 0;
    this.el.classList.remove('show');
  }
}

// ---------------- XP & Level ----------------

export class Progress {
  constructor(store, onLevel) {
    this.store = store;
    this.xp = store.get('xp', 0);
    this.onLevel = onLevel;
    this.el = document.getElementById('xp');
    this.render();
  }

  static levelFor(xp) { return Math.floor(Math.sqrt(xp / 40)) + 1; }
  static xpFor(level) { return (level - 1) ** 2 * 40; }

  add(amount) {
    const before = Progress.levelFor(this.xp);
    this.xp += amount;
    this.store.set('xp', this.xp);
    const after = Progress.levelFor(this.xp);
    this.render();
    if (after > before) this.onLevel?.(after);
  }

  render() {
    const lv = Progress.levelFor(this.xp);
    const lo = Progress.xpFor(lv), hi = Progress.xpFor(lv + 1);
    const pct = ((this.xp - lo) / (hi - lo)) * 100;
    this.el.querySelector('.xp-lv').textContent = 'Lv.' + lv;
    this.el.querySelector('.xp-fill').style.width = pct + '%';
    this.el.title = `${this.xp - lo} / ${hi - lo} XP bis Level ${lv + 1}`;
  }
}

export function levelBanner(level) {
  const el = document.createElement('div');
  el.className = 'level-banner';
  el.innerHTML = `<div class="lb-small">✦ LEVEL UP ✦</div><div class="lb-big">Lv.${level}</div><div class="lb-jp">レベルアップ!</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2800);
}
