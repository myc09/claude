// Code-chan: das Maskottchen. Sie reagiert auf Ausführen, Fehler, Combos und Level-ups.

const SVG = `
<svg class="chan" viewBox="0 0 140 150" aria-hidden="true">
  <defs>
    <linearGradient id="chan-hair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--hair-1)"/><stop offset="1" stop-color="var(--hair-2)"/>
    </linearGradient>
    <radialGradient id="chan-eye" cx=".5" cy=".35" r=".7">
      <stop offset="0" stop-color="var(--eye-1)"/><stop offset="1" stop-color="var(--eye-2)"/>
    </radialGradient>
  </defs>
  <g class="chan-body">
    <!-- Zöpfe -->
    <path class="tail tail-l" d="M30 70 C6 80 4 116 18 136 C22 118 24 100 38 88Z" fill="url(#chan-hair)"/>
    <path class="tail tail-r" d="M110 70 C134 80 136 116 122 136 C118 118 116 100 102 88Z" fill="url(#chan-hair)"/>
    <!-- Hinterkopf + Katzenohren -->
    <path d="M28 42 L24 8 L52 28Z" fill="url(#chan-hair)"/>
    <path d="M112 42 L116 8 L88 28Z" fill="url(#chan-hair)"/>
    <path d="M31 36 L29 16 L45 28Z" fill="var(--ear-in)"/>
    <path d="M109 36 L111 16 L95 28Z" fill="var(--ear-in)"/>
    <ellipse cx="70" cy="72" rx="46" ry="48" fill="url(#chan-hair)"/>
    <!-- Hals + Kragen -->
    <path d="M48 116 Q70 128 92 116 L98 150 L42 150Z" fill="var(--outfit)"/>
    <path d="M58 118 L70 134 L82 118" fill="none" stroke="var(--outfit-line)" stroke-width="3" stroke-linejoin="round"/>
    <!-- Gesicht -->
    <ellipse cx="70" cy="80" rx="36" ry="35" fill="var(--skin)"/>
    <!-- Pony -->
    <path d="M32 74 C30 44 48 30 70 30 C92 30 110 44 108 74 C102 62 96 56 92 52 C90 60 84 64 80 66 C80 58 76 52 72 50 C68 58 60 64 52 66 C54 60 54 56 52 52 C44 58 38 64 32 74Z" fill="url(#chan-hair)"/>
    <!-- Haarspange -->
    <path class="clip" d="M98 46 l3.5 7 7.5 1 -5.5 5.2 1.4 7.6 -6.9-3.7 -6.9 3.7 1.4-7.6 -5.5-5.2 7.5-1z" fill="var(--clip)"/>
    <!-- Wangen -->
    <ellipse class="blush" cx="47" cy="94" rx="7" ry="4" fill="var(--blush)"/>
    <ellipse class="blush" cx="93" cy="94" rx="7" ry="4" fill="var(--blush)"/>

    <!-- Augen: je nach Stimmung wird eine Gruppe angezeigt -->
    <g class="eyes eyes-open">
      <g class="eye-l"><ellipse cx="54" cy="82" rx="7.5" ry="10" fill="url(#chan-eye)"/><circle cx="51.5" cy="78" r="3" fill="#fff"/><circle cx="57" cy="86" r="1.4" fill="#fff"/></g>
      <g class="eye-r"><ellipse cx="86" cy="82" rx="7.5" ry="10" fill="url(#chan-eye)"/><circle cx="83.5" cy="78" r="3" fill="#fff"/><circle cx="89" cy="86" r="1.4" fill="#fff"/></g>
      <path d="M45 70 Q54 66 62 70 M78 70 Q86 66 95 70" stroke="var(--line)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>
    <g class="eyes eyes-happy">
      <path d="M46 85 Q54 74 62 85 M78 85 Q86 74 94 85" stroke="var(--line)" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    </g>
    <g class="eyes eyes-sad">
      <path d="M46 78 L60 84 L46 90 M94 78 L80 84 L94 90" stroke="var(--line)" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="tear" d="M43 92 q-3 6 0 8 q3 -2 0 -8z" fill="#8fd3ff"/>
    </g>
    <g class="eyes eyes-think">
      <path d="M46 84 L62 84" stroke="var(--line)" stroke-width="3.4" stroke-linecap="round"/>
      <g><ellipse cx="86" cy="82" rx="7.5" ry="10" fill="url(#chan-eye)"/><circle cx="83.5" cy="78" r="3" fill="#fff"/></g>
      <path d="M78 68 Q86 64 95 70" stroke="var(--line)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>
    <g class="eyes eyes-wow">
      <g><ellipse cx="54" cy="82" rx="9" ry="11.5" fill="url(#chan-eye)"/><path d="M54 74 l2 4.5 4.8.5 -3.6 3.2 1 4.8 -4.2-2.5 -4.2 2.5 1-4.8 -3.6-3.2 4.8-.5z" fill="#fff"/></g>
      <g><ellipse cx="86" cy="82" rx="9" ry="11.5" fill="url(#chan-eye)"/><path d="M86 74 l2 4.5 4.8.5 -3.6 3.2 1 4.8 -4.2-2.5 -4.2 2.5 1-4.8 -3.6-3.2 4.8-.5z" fill="#fff"/></g>
    </g>
    <g class="eyes eyes-sleep">
      <path d="M46 84 Q54 89 62 84 M78 84 Q86 89 94 84" stroke="var(--line)" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>

    <!-- Münder -->
    <path class="mouth mouth-idle" d="M65 100 Q70 104 75 100" stroke="var(--line)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path class="mouth mouth-happy" d="M62 98 Q70 110 78 98Z" fill="var(--mouth)" stroke="var(--line)" stroke-width="2" stroke-linejoin="round"/>
    <path class="mouth mouth-sad" d="M63 104 Q66 99 70 103 Q74 99 77 104" stroke="var(--line)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse class="mouth mouth-wow" cx="70" cy="103" rx="4.5" ry="5.5" fill="var(--mouth)" stroke="var(--line)" stroke-width="2"/>
    <path class="mouth mouth-think" d="M64 102 L76 100" stroke="var(--line)" stroke-width="2.4" stroke-linecap="round"/>
  </g>
  <text class="zzz" x="108" y="40">z</text>
</svg>`;

const LINES = {
  greet: ['Konnichiwa! Lass uns coden! ✨', 'Yatta, du bist da! (≧▽≦)', 'Bereit für ein neues Abenteuer?'],
  run: ['Los geht\'s! 🚀', 'Ikuzo~!', 'Kompiliere mit voller Kraft!'],
  ok: ['Sugoi! Es läuft! ✨', 'Perfekt! (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', 'Kakkoii~! Code-Meister!', 'Yatta! Keine Fehler!'],
  error: ['Uwaa, ein Fehler! Klick ihn an, ich zeig dir die Zeile!', 'Nicht aufgeben, Senpai! 💪', 'Ein Bug! Gemeinsam schaffen wir das!'],
  combo: ['Was für eine Combo! 🔥', 'Deine Finger glühen!', 'Unaufhaltsam! ⚡'],
  idle: ['Tipp: Strg+Enter führt den Code aus!', 'Tipp: Strg+F zum Suchen.', 'Trink mal was Wasser~ 🍵', 'Tipp: Fehlermeldungen kann man anklicken!', 'Tipp: Strg+B öffnet den Explorer.', 'Ich glaub an dich! ♡'],
  sleep: ['Zzz… 💤'],
  level: (n) => [`LEVEL UP! Du bist jetzt Level ${n}! 🎉`],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Mascot {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'mascot';
    this.el.innerHTML = `<div class="bubble"></div>${SVG}`;
    parent.appendChild(this.el);
    this.bubble = this.el.querySelector('.bubble');
    this.mood = 'idle';
    this.el.querySelector('.chan').addEventListener('click', () => {
      this.set('happy', pick(LINES.idle), 3500);
      this.el.classList.remove('boing'); void this.el.offsetWidth; this.el.classList.add('boing');
    });
    this.resetIdle();
    ['keydown', 'pointerdown'].forEach((e) => document.addEventListener(e, () => this.resetIdle(), { passive: true }));
  }

  set(mood, text, duration = 3000) {
    this.mood = mood;
    this.el.dataset.mood = mood;
    clearTimeout(this.timer);
    if (text) {
      this.bubble.textContent = text;
      this.bubble.classList.add('show');
    }
    if (duration) this.timer = setTimeout(() => { this.el.dataset.mood = 'idle'; this.mood = 'idle'; this.bubble.classList.remove('show'); }, duration);
  }

  say(kind, arg) {
    const lines = typeof LINES[kind] === 'function' ? LINES[kind](arg) : LINES[kind];
    const moods = { greet: 'happy', run: 'think', ok: 'happy', error: 'sad', combo: 'wow', level: 'wow', idle: 'idle' };
    this.set(moods[kind] || 'idle', pick(lines), kind === 'run' ? 0 : 3800);
  }

  resetIdle() {
    if (this.mood === 'sleep') this.set('idle', '', 1);
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.set('sleep', LINES.sleep[0], 0), 90_000);
  }
}
