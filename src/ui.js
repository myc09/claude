// Glas-Oberflächen: Dialoge (statt prompt/confirm), Befehlspalette, Erfolge und Boot-Bildschirm.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function overlay(cls) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap ' + cls;
  wrap.innerHTML = '<div class="modal-backdrop"></div>';
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 200);
  };
  return { wrap, close };
}

// ---------------- Dialoge ----------------

/** Bestätigung mit zwei Knöpfen. Liefert true/false. */
export function confirmDialog({ title, text, ok = 'OK', cancel = 'Abbrechen', danger = false, icon = '✦' }) {
  return new Promise((resolve) => {
    const { wrap, close } = overlay('modal-confirm');
    wrap.insertAdjacentHTML('beforeend', `
      <div class="modal glass hud" role="dialog" aria-modal="true">
        <div class="modal-icon ${danger ? 'danger' : ''}">${icon}</div>
        <h3>${esc(title)}</h3>
        <p>${esc(text).replace(/\n/g, '<br>')}</p>
        <div class="modal-actions">
          <button class="btn ghost" data-r="0">${esc(cancel)}</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button>
        </div>
      </div>`);
    const done = (r) => { close(); document.removeEventListener('keydown', key, true); resolve(r); };
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
    };
    document.addEventListener('keydown', key, true);
    wrap.querySelector('.modal-backdrop').onclick = () => done(false);
    wrap.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => done(b.dataset.r === '1')));
    setTimeout(() => wrap.querySelector('[data-r="1"]').focus(), 50);
  });
}

/**
 * Texteingabe. Mit `templates` erscheinen Sprach-Chips, die die Dateiendung setzen.
 * Liefert { value, template } oder null.
 */
export function inputDialog({ title, label, value = '', placeholder = '', ok = 'OK', templates = null, icon = '✎' }) {
  return new Promise((resolve) => {
    const { wrap, close } = overlay('modal-input');
    const chips = templates ? `<div class="chips">${templates.map((t, i) =>
      `<button type="button" class="chip-btn${i === 0 ? ' on' : ''}" data-i="${i}" style="--tc:${t.color}"><b>${esc(t.badge)}</b>${esc(t.label)}</button>`).join('')}</div>` : '';
    wrap.insertAdjacentHTML('beforeend', `
      <form class="modal glass hud" role="dialog" aria-modal="true">
        <div class="modal-icon">${icon}</div>
        <h3>${esc(title)}</h3>
        ${chips}
        <label class="field"><span>${esc(label)}</span>
          <input type="text" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-cancel>Abbrechen</button>
          <button type="submit" class="btn primary">${esc(ok)}</button>
        </div>
      </form>`);
    const form = wrap.querySelector('form');
    const input = form.querySelector('input');
    let tpl = templates ? templates[0] : null;
    const applyExt = () => {
      if (!tpl || !tpl.ext) return;
      const base = input.value.replace(/\.[^./]*$/, '') || 'main';
      input.value = base + tpl.ext;
      input.setSelectionRange(0, base.length);
    };
    form.querySelectorAll('.chip-btn').forEach((b) => (b.onclick = () => {
      form.querySelectorAll('.chip-btn').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      tpl = templates[Number(b.dataset.i)];
      applyExt();
      input.focus();
    }));
    const done = (r) => { close(); document.removeEventListener('keydown', key, true); resolve(r); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    document.addEventListener('keydown', key, true);
    wrap.querySelector('.modal-backdrop').onclick = () => done(null);
    form.querySelector('[data-cancel]').onclick = () => done(null);
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return input.focus();
      done({ value: v, template: tpl });
    };
    setTimeout(() => {
      if (templates && !value) { input.value = 'main'; applyExt(); }
      input.focus();
      const dot = input.value.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
    }, 60);
  });
}

// ---------------- Befehlspalette ----------------

function score(query, text) {
  if (!query) return 1;
  const q = query.toLowerCase(), t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - idx;
  // Buchstaben in Reihenfolge (z. B. "hpy" findet "hallo.py")
  let ti = 0, s = 0;
  for (const ch of q) {
    const f = t.indexOf(ch, ti);
    if (f < 0) return 0;
    s += f === ti ? 3 : 1;
    ti = f + 1;
  }
  return s;
}

/** items: [{ label, hint, icon, color, group, run }] */
export function openPalette(getItems, placeholder = 'Datei oder Befehl suchen …') {
  if (document.querySelector('.modal-palette')) return;
  const { wrap, close } = overlay('modal-palette');
  wrap.insertAdjacentHTML('beforeend', `
    <div class="palette glass" role="dialog" aria-modal="true">
      <div class="palette-search">
        <span class="palette-glyph">⌕</span>
        <input type="text" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">
        <kbd>ESC</kbd>
      </div>
      <div class="palette-list" role="listbox"></div>
      <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> wählen</span><span><kbd>↵</kbd> öffnen</span><span class="palette-jp">コマンド</span></div>
    </div>`);
  const input = wrap.querySelector('input');
  const list = wrap.querySelector('.palette-list');
  const all = getItems();
  let shown = [], sel = 0;

  const render = () => {
    const q = input.value.trim();
    shown = all.map((it) => ({ it, s: score(q, it.label + ' ' + (it.hint || '')) }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map((x) => x.it);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    let group = null;
    list.innerHTML = shown.length ? '' : '<div class="palette-empty">Nichts gefunden (｡•́︿•̀｡)</div>';
    shown.forEach((it, i) => {
      if (!q && it.group !== group) {
        group = it.group;
        list.insertAdjacentHTML('beforeend', `<div class="palette-group">${esc(group)}</div>`);
      }
      const row = document.createElement('div');
      row.className = 'palette-item' + (i === sel ? ' sel' : '');
      row.style.setProperty('--tc', it.color || 'var(--accent-2)');
      row.innerHTML = `<span class="pi-icon">${esc(it.icon || '›')}</span><span class="pi-label">${esc(it.label)}</span><span class="pi-hint">${esc(it.hint || '')}</span>`;
      row.onmouseenter = () => { sel = i; mark(); };
      row.onclick = () => pick(i);
      list.appendChild(row);
    });
  };
  const mark = () => {
    list.querySelectorAll('.palette-item').forEach((r, i) => r.classList.toggle('sel', i === sel));
    list.querySelectorAll('.palette-item')[sel]?.scrollIntoView({ block: 'nearest' });
  };
  const done = () => { close(); document.removeEventListener('keydown', key, true); };
  const pick = (i) => { const it = shown[i]; done(); if (it) setTimeout(() => it.run(), 10); };
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
  };
  document.addEventListener('keydown', key, true);
  wrap.querySelector('.modal-backdrop').onclick = done;
  input.oninput = () => { sel = 0; render(); };
  render();
  setTimeout(() => input.focus(), 30);
}

// ---------------- Erfolge ----------------

export const ACHIEVEMENTS = {
  firstRun: { icon: '🚀', title: 'Erster Start', desc: 'Dein erstes Programm ist gelaufen!' },
  firstPy: { icon: '🐍', title: 'Schlangenbeschwörer', desc: 'Ein Python-Programm erfolgreich ausgeführt' },
  firstC: { icon: '⚙️', title: 'Bare Metal', desc: 'Ein C-Programm kompiliert und ausgeführt' },
  bugfix: { icon: '⚔️', title: 'Bug-Jäger', desc: 'Einen Fehler gefunden und behoben' },
  runs10: { icon: '🔟', title: 'Auf Touren', desc: '10 Programme erfolgreich ausgeführt' },
  runs50: { icon: '💫', title: 'Code-Maschine', desc: '50 Programme erfolgreich ausgeführt' },
  combo50: { icon: '🔥', title: 'Combo-Meister', desc: '50er Tipp-Combo erreicht' },
  combo100: { icon: '⚡', title: 'Göttliche Finger', desc: '100er Tipp-Combo erreicht' },
  level5: { icon: '🌟', title: 'Aufsteiger', desc: 'Level 5 erreicht' },
  night: { icon: '🌙', title: 'Nachteule', desc: 'Nach 23 Uhr noch am Coden' },
  creator: { icon: '✨', title: 'Schöpfer', desc: 'Eine neue Datei angelegt' },
};

export class Achievements {
  constructor(store, onUnlock) {
    this.store = store;
    this.got = new Set(store.get('achievements', []));
    this.stats = store.get('stats', { runs: 0 });
    this.onUnlock = onUnlock;
  }

  bump(key) {
    this.stats[key] = (this.stats[key] || 0) + 1;
    this.store.set('stats', this.stats);
    return this.stats[key];
  }

  unlock(id) {
    if (this.got.has(id) || !ACHIEVEMENTS[id]) return;
    this.got.add(id);
    this.store.set('achievements', [...this.got]);
    const a = ACHIEVEMENTS[id];
    const el = document.createElement('div');
    el.className = 'achievement glass';
    el.innerHTML = `<div class="ach-icon">${a.icon}</div><div><div class="ach-top">ERFOLG FREIGESCHALTET · 実績解除</div><div class="ach-title">${esc(a.title)}</div><div class="ach-desc">${esc(a.desc)}</div></div>`;
    // Mehrere Erfolge gleichzeitig stapeln sich untereinander
    let stack = document.querySelector('.ach-stack');
    if (!stack) { stack = document.createElement('div'); stack.className = 'ach-stack'; document.body.appendChild(stack); }
    el.style.animationDelay = stack.childElementCount * 0.25 + 's';
    stack.appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200 + stack.childElementCount * 250);
    setTimeout(() => el.remove(), 4800);
    this.onUnlock?.(a);
  }

  count() { return this.got.size; }
}

// ---------------- Boot-Bildschirm ----------------

export function bootDone() {
  const el = document.getElementById('boot');
  if (!el) return;
  const wait = Math.max(0, 900 - (performance.now() - (window.__bootStart || 0)));
  setTimeout(() => {
    el.classList.add('done');
    setTimeout(() => el.remove(), 700);
  }, wait);
}
