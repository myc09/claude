// CodePad – Client: Editor, Explorer, Tabs, Terminal und Synchronisierung.

import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab, indentMore, cursorCharLeft, cursorCharRight, cursorLineUp, cursorLineDown, undo, redo } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { openSearchPanel } from '@codemirror/search';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { animeTheme } from './theme.js';
import { Mascot } from './mascot.js';
import { Sakura, fx, Combo, Progress, levelBanner } from './effects.js';
import { confirmDialog, inputDialog, openPalette, Achievements, ACHIEVEMENTS, bootDone } from './ui.js';
import { rainbowIndent } from './indent.js';

const $ = (id) => document.getElementById(id);
const clientId = Math.random().toString(36).slice(2);
const isMobile = () => matchMedia('(max-width: 760px)').matches;

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('codepad.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('codepad.' + key, JSON.stringify(value)); } catch {}
  },
  del(key) {
    try { localStorage.removeItem('codepad.' + key); } catch {}
  },
};

// ---------------- API ----------------

class AuthError extends Error {}

async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { showLogin(); throw new AuthError('Nicht angemeldet'); }
  if (!res.ok) {
    const err = new Error(data.error || `Fehler ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function toast(text, isError = false) {
  const el = $('toast');
  el.textContent = text;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ---------------- Login ----------------

function showLogin() {
  bootDone();
  $('login-mascot').appendChild(mascot.el);
  mascot.set('happy', '', 0);
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
  $('login-password').focus();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: $('login-password').value }),
  });
  if (res.ok) {
    $('login-password').value = '';
    $('login').classList.add('hidden');
    $('mascot-home').appendChild(mascot.el);
    start();
  } else {
    const data = await res.json().catch(() => ({}));
    $('login-error').textContent = data.error || 'Anmeldung fehlgeschlagen';
    mascot.set('sad', '', 2500);
  }
});

// ---------------- Editor ----------------

const langConf = new Compartment();
const wrapConf = new Compartment();
const fontConf = new Compartment();
let fontSize = store.get('fontSize', isMobile() ? 14 : 14);
let wrap = store.get('wrap', isMobile());

const fontTheme = (px) => EditorView.theme({ '&': { fontSize: px + 'px' }, '.cm-gutters': { fontSize: px + 'px' } });

function languageFor(path) {
  const ext = path.split('.').pop().toLowerCase();
  if (ext === 'py' || ext === 'pyw') return python();
  if (['c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh'].includes(ext)) return cpp();
  return [];
}

const isRunnable = (path) => /\.(py|c|cpp|cc)$/i.test(path || '');

function createState(path, content) {
  return EditorState.create({
    doc: content,
    extensions: [
      basicSetup,
      animeTheme,
      rainbowIndent,
      indentUnit.of('    '),
      EditorState.tabSize.of(4),
      langConf.of(languageFor(path)),
      wrapConf.of(wrap ? EditorView.lineWrapping : []),
      fontConf.of(fontTheme(fontSize)),
      keymap.of([
        { key: 'Mod-s', run: () => { saveActive(); return true; }, preventDefault: true },
        { key: 'Mod-Enter', run: () => { runActive(); return true; } },
        { key: 'F5', run: () => { runActive(); return true; }, preventDefault: true },
        indentWithTab,
      ]),
      EditorView.updateListener.of((u) => { if (u.docChanged) { onEdit(); onTyping(u); } if (u.docChanged || u.selectionSet) updateStatus(u.state); }),
    ],
  });
}

const view = new EditorView({ parent: $('editor'), state: createState('', '') });

function reconfigureAll(effectsFor) {
  view.dispatch({ effects: effectsFor() });
  for (const tab of tabs) if (tab !== activeTab()) tab.state = tab.state.update({ effects: effectsFor() }).state;
}

// ---------------- Anime-Extras ----------------

const settings = {
  // Neuer Schlüssel, damit alle einmal das neue Standard-Theme „Koralle“ bekommen
  theme: store.get('theme2', 'koralle'),
  playful: store.get('playful', false),
  fx: store.get('fx', true),
  petals: store.get('petals', true),
  mascot: store.get('mascot', true),
};
const sakura = new Sakura();
const achievements = new Achievements(store, () => { fx.confetti(); renderWelcome(); });
const unlock = (id) => { if (settings.playful) achievements.unlock(id); };
const mascot = new Mascot($('mascot-home'));
let combo = null;
let progress = null;
let typedChars = 0;
let lastRunFailed = false;

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  // Standard ist der sachliche Modus; Maskottchen, Blüten und Spiel-Elemente nur im verspielten Modus
  const anime = settings.theme !== 'classic' && settings.playful;
  fx.enabled = settings.fx && anime;
  sakura.setEnabled(settings.petals && anime);
  document.body.classList.toggle('pro', !settings.playful);
  document.body.classList.toggle('no-mascot', !settings.mascot || !settings.playful);
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content =
    { koralle: '#0d0f15', sakura: '#1b1033', neon: '#070b1c', matcha: '#0f1d18', classic: '#333333' }[settings.theme];
  document.querySelectorAll('[data-theme-pick]').forEach((b) => b.classList.toggle('on', b.dataset.themePick === settings.theme));
}

function onTyping(update) {
  if (!settings.playful) return;
  if (!update.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete'))) return;
  let inserted = 0;
  update.changes.iterChanges((fa, ta, fb, tb, text) => { inserted += text.length; });
  const n = combo.hit();
  typedChars += inserted;
  if (typedChars >= 40) { progress.add(Math.floor(typedChars / 40)); typedChars %= 40; }
  if (!fx.enabled) return;
  const pos = update.state.selection.main.head;
  view.requestMeasure({
    read: (v) => v.coordsAtPos(pos),
    write: (c) => c && fx.typing(c.left, c.top + (c.bottom - c.top) / 2, n),
  });
}

// ---------------- Statusleiste ----------------

const LANG_NAMES = { py: 'PYTHON', c: 'C', h: 'C HEADER', cpp: 'C++', cc: 'C++', hpp: 'C++ HEADER', md: 'MARKDOWN', txt: 'TEXT' };

function updateStatus(state = view.state) {
  const tab = activeTab();
  if (!tab) { $('sb-pos').textContent = ''; $('sb-lang').textContent = ''; return; }
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  $('sb-pos').textContent = `LN ${line.number}, COL ${head - line.from + 1}`;
  const ext = tab.path.split('.').pop().toLowerCase();
  $('sb-lang').textContent = '⟨/⟩ ' + (LANG_NAMES[ext] || ext.toUpperCase());
  $('sb-lang').dataset.kind = kindOf(tab.path);
  $('editor-wrap').dataset.kind = kindOf(tab.path);
  document.body.dataset.kind = kindOf(tab.path);
}

function setConn(online) {
  const el = $('sb-conn');
  el.textContent = online ? '● ONLINE · SYNC' : '● OFFLINE';
  el.classList.toggle('on', online);
}

function tickClock() {
  $('sb-clock').textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
tickClock();
setInterval(tickClock, 15000);

function checkNight() {
  const h = new Date().getHours();
  if (h >= 23 || h < 4) unlock('night');
}

function onLevelUp(level) {
  if (level >= 5) unlock('level5');
  levelBanner(level);
  fx.confetti();
  if (settings.petals) sakura.storm();
  mascot.say('level', level);
}

// ---------------- Tabs & Speichern ----------------

/** @type {{path:string, state:EditorState, mtime:number, saved:string, saving:boolean, again:boolean, timer:any, error:boolean}[]} */
let tabs = [];
let activePath = null;

const activeTab = () => tabs.find((t) => t.path === activePath) || null;
const tabContent = (tab) => (tab === activeTab() ? view.state.doc.toString() : tab.state.doc.toString());
const isDirty = (tab) => tabContent(tab) !== tab.saved;

async function openFile(path, { focus = true } = {}) {
  let tab = tabs.find((t) => t.path === path);
  if (!tab) {
    let data;
    try { data = await api('GET', '/file?path=' + encodeURIComponent(path)); } catch (e) {
      if (!(e instanceof AuthError)) toast(`${path}: ${e.message}`, true);
      return;
    }
    tab = { path, state: createState(path, data.content), mtime: data.mtime, saved: data.content, saving: false, again: false, timer: null, error: false };
    // Nicht gespeicherte Änderungen (z. B. offline gemacht) wiederherstellen
    const backup = store.get('backup:' + path);
    if (backup && backup.base === data.mtime && backup.content !== data.content) {
      tab.state = tab.state.update({ changes: { from: 0, to: tab.state.doc.length, insert: backup.content } }).state;
      setTimeout(() => scheduleSave(tab), 0);
    }
    tabs.push(tab);
  }
  activate(path, focus);
  if (isMobile()) closeSidebar();
}

function activate(path, focus = true) {
  const current = activeTab();
  if (current) current.state = view.state;
  activePath = path;
  const tab = activeTab();
  if (tab) {
    view.setState(tab.state);
    if (focus && !isMobile()) view.focus();
  }
  $('welcome').classList.toggle('hidden', !!tab);
  $('editor').style.visibility = tab ? '' : 'hidden';
  if (tab) store.set('recent', [path, ...store.get('recent', []).filter((p) => p !== path)].slice(0, 10));
  else renderWelcome();
  renderTabs();
  renderTree();
  updateTitle();
  persistSession();
}

function closeTab(path) {
  const tab = tabs.find((t) => t.path === path);
  if (!tab) return;
  if (isDirty(tab)) saveTab(tab);
  const idx = tabs.indexOf(tab);
  if (tab === activeTab()) tab.state = view.state;
  tabs.splice(idx, 1);
  if (activePath === path) {
    const next = tabs[idx] || tabs[idx - 1];
    activePath = null;
    if (next) activate(next.path, false);
    else { view.setState(createState('', '')); activate(null); }
  } else {
    renderTabs();
    persistSession();
  }
}

function onEdit() {
  const tab = activeTab();
  if (!tab) return;
  scheduleSave(tab);
  renderTabs();
  updateTitle();
}

function scheduleSave(tab) {
  clearTimeout(tab.timer);
  tab.timer = setTimeout(() => saveTab(tab), 700);
}

async function saveTab(tab, { force = false } = {}) {
  clearTimeout(tab.timer);
  if (tab.saving) { tab.again = true; return tab.savePromise; }
  const content = tabContent(tab);
  if (content === tab.saved && !force) return;
  tab.saving = true;
  store.set('backup:' + tab.path, { base: tab.mtime, content });
  updateTitle();
  tab.savePromise = (async () => {
    try {
      const res = await api('PUT', '/file', { path: tab.path, content, baseMtime: force ? null : tab.mtime, clientId });
      tab.mtime = res.mtime;
      tab.saved = content;
      tab.error = false;
      store.del('backup:' + tab.path);
    } catch (e) {
      if (e.status === 409) await resolveConflict(tab, e.data);
      else if (!(e instanceof AuthError)) {
        tab.error = true;
        setTimeout(() => isDirty(tab) && saveTab(tab), 4000);
      }
    } finally {
      tab.saving = false;
      renderTabs();
      updateTitle();
    }
    if (tab.again) { tab.again = false; await saveTab(tab); }
  })();
  return tab.savePromise;
}

async function resolveConflict(tab, remote) {
  const keepMine = await confirmDialog({
    icon: '⇄',
    title: 'Auf einem anderen Gerät geändert',
    text: `"${tab.path}" wurde inzwischen woanders bearbeitet. Welche Version soll bleiben?`,
    ok: 'Meine behalten',
    cancel: 'Andere laden',
  });
  if (keepMine) {
    tab.mtime = remote.mtime;
    tab.saving = false;
    await saveTab(tab, { force: true });
  } else {
    replaceContent(tab, remote.content, remote.mtime);
  }
}

function replaceContent(tab, content, mtime) {
  tab.saved = content;
  tab.mtime = mtime;
  store.del('backup:' + tab.path);
  if (tab === activeTab()) {
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      selection: { anchor: Math.min(sel.anchor, content.length) },
    });
  } else {
    tab.state = tab.state.update({ changes: { from: 0, to: tab.state.doc.length, insert: content } }).state;
  }
  renderTabs();
  updateTitle();
}

async function saveActive() {
  const tab = activeTab();
  if (tab) await saveTab(tab);
}

async function saveAll() {
  await Promise.all(tabs.filter(isDirty).map((t) => saveTab(t)));
}

// Änderungen von anderen Geräten übernehmen
async function syncOpenTabs() {
  for (const tab of [...tabs]) {
    try {
      const data = await api('GET', '/file?path=' + encodeURIComponent(tab.path));
      if (Math.abs(data.mtime - tab.mtime) > 1 && data.content !== tab.saved) {
        if (!isDirty(tab)) replaceContent(tab, data.content, data.mtime);
      } else if (!isDirty(tab)) {
        tab.mtime = data.mtime;
      }
    } catch (e) {
      if (e.status === 404) { tabs = tabs.filter((t) => t !== tab); if (activePath === tab.path) activate(tabs[0]?.path ?? null, false); }
    }
  }
  renderTabs();
}

function renderTabs() {
  const el = $('tabs');
  el.innerHTML = '';
  for (const tab of tabs) {
    const div = document.createElement('div');
    div.className = 'tab' + (tab.path === activePath ? ' active' : '') + (isDirty(tab) ? ' dirty' : '');
    div.dataset.kind = kindOf(tab.path);
    div.title = tab.path;
    const name = tab.path.split('/').pop();
    div.innerHTML = `<span class="ficon ${iconClass(name)}">${iconText(name)}</span><span></span>` +
      `<button class="close" aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    div.children[1].textContent = name;
    div.addEventListener('click', () => activate(tab.path));
    div.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(tab.path); });
    div.querySelector('.close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.path); });
    el.appendChild(div);
    if (tab.path === activePath) requestAnimationFrame(() => div.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }
}

function updateTitle() {
  const tab = activeTab();
  $('title-file').textContent = tab ? tab.path : 'CodePad';
  document.title = tab ? `${tab.path.split('/').pop()} – CodePad` : 'CodePad';
  const st = $('save-state');
  st.className = 'save-state';
  if (!tab) st.textContent = '';
  else if (tab.error) { st.textContent = navigator.onLine ? 'Fehler beim Speichern' : 'offline – nicht gespeichert'; st.classList.add('error'); }
  else if (tab.saving) st.textContent = 'speichert …';
  else if (isDirty(tab)) { st.textContent = '●'; st.classList.add('dirty'); }
  else st.textContent = 'gespeichert ✓';
  $('btn-run').disabled = !tab || !isRunnable(tab.path);
  updateStatus();
}

function persistSession() {
  store.set('session', { tabs: tabs.map((t) => t.path), active: activePath });
}

// ---------------- Explorer ----------------

let tree = [];
const expanded = new Set(store.get('expanded', []));

async function loadTree() {
  try {
    tree = await api('GET', '/tree');
    renderTree();
  } catch (e) {
    if (!(e instanceof AuthError)) toast('Dateien konnten nicht geladen werden', true);
  }
}

function iconText(name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return { py: 'py', c: 'C', h: 'h', cpp: '++', cc: '++', hpp: 'h', md: 'M↓', json: '{}', txt: '≡' }[ext] || '·';
}

// Bestimmt die Leuchtfarbe von Tab und Datei (siehe data-kind im CSS)
function kindOf(name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return { py: 'py', c: 'c', cpp: 'cpp', cc: 'cpp', h: 'h', hpp: 'h' }[ext] || 'other';
}

function iconClass(name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return { py: 'ic-py', c: 'ic-c', h: 'ic-h', hpp: 'ic-h', cpp: 'ic-cpp', cc: 'ic-cpp' }[ext] || 'ic-txt';
}

function renderTree() {
  const root = $('tree');
  root.innerHTML = '';
  const walk = (nodes, depth, parent) => {
    for (const node of nodes) {
      const row = document.createElement('div');
      const open = node.type === 'dir' && expanded.has(node.path);
      row.className = 'node' + (open ? ' open' : '') + (node.path === activePath ? ' active' : '');
      row.dataset.kind = node.type === 'dir' ? 'dir' : kindOf(node.name);
      row.style.paddingLeft = 8 + depth * 14 + 'px';
      row.draggable = !isMobile();
      row.innerHTML =
        `<svg class="chev ${node.type === 'dir' ? '' : 'none'}" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>` +
        (node.type === 'dir'
          ? `<svg class="ficon ic-dir" viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v11H3z"/></svg>`
          : `<span class="ficon ${iconClass(node.name)}">${iconText(node.name)}</span>`) +
        `<span class="name"></span>` +
        `<button class="icon-btn small node-menu" aria-label="Aktionen"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3" class="fill"/><circle cx="12" cy="12" r="1.3" class="fill"/><circle cx="19" cy="12" r="1.3" class="fill"/></svg></button>`;
      row.querySelector('.name').textContent = node.name;
      row.addEventListener('click', () => {
        if (node.type === 'dir') {
          expanded.has(node.path) ? expanded.delete(node.path) : expanded.add(node.path);
          store.set('expanded', [...expanded]);
          renderTree();
        } else openFile(node.path);
      });
      const menu = (e) => { e.preventDefault(); e.stopPropagation(); nodeMenu(node, e); };
      row.querySelector('.node-menu').addEventListener('click', menu);
      row.addEventListener('contextmenu', menu);

      // Drag & Drop zum Verschieben (Desktop)
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/codepad', node.path); });
      const target = node.type === 'dir' ? node.path : parent;
      row.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/codepad')) { e.preventDefault(); row.classList.add('drop'); } });
      row.addEventListener('dragleave', () => row.classList.remove('drop'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drop');
        const from = e.dataTransfer.getData('text/codepad');
        if (from) moveTo(from, target);
      });
      root.appendChild(row);
      if (open) walk(node.children, depth + 1, node.path);
    }
  };
  walk(tree, 0, '');
}

const joinPath = (dir, name) => (dir ? dir + '/' + name : name);
const parentOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

async function moveTo(from, dir) {
  const to = joinPath(dir, from.split('/').pop());
  if (to === from || to.startsWith(from + '/')) return;
  await renamePath(from, to);
}

const TEMPLATES = [
  { label: 'Python', badge: 'py', ext: '.py', color: 'var(--accent-3)', content: '# Mein Python-Programm\n\nprint("Hallo Welt!")\n' },
  { label: 'C', badge: 'C', ext: '.c', color: 'var(--accent-2)', content: '#include <stdio.h>\n\nint main(void) {\n    printf("Hallo Welt!\\n");\n    return 0;\n}\n' },
  { label: 'C++', badge: '++', ext: '.cpp', color: 'var(--accent)', content: '#include <iostream>\n\nint main() {\n    std::cout << "Hallo Welt!" << std::endl;\n    return 0;\n}\n' },
  { label: 'Leer', badge: '·', ext: null, color: 'var(--accent-5)', content: '' },
];

async function createEntry(type, dir = '', preset = null) {
  const templates = type === 'file' ? (preset ? [preset, ...TEMPLATES.filter((t) => t !== preset)] : TEMPLATES) : null;
  const res = await inputDialog(type === 'dir'
    ? { title: 'Neuer Ordner', label: 'Name', placeholder: 'projekte', ok: 'Anlegen', icon: '⌂' }
    : { title: 'Neue Datei', label: 'Dateiname', placeholder: 'main.py', ok: 'Anlegen', templates, icon: '✦' });
  if (!res) return;
  const path = joinPath(dir, res.value);
  try {
    await api('POST', '/create', { path, type });
    if (type === 'file' && res.template?.content && (!res.template.ext || path.endsWith(res.template.ext))) {
      await api('PUT', '/file', { path, content: res.template.content, clientId });
    }
    if (type === 'file') unlock('creator');
    if (dir) expanded.add(dir);
    if (type === 'dir') expanded.add(path);
    store.set('expanded', [...expanded]);
    await loadTree();
    if (type === 'file') openFile(path);
  } catch (e) {
    if (!(e instanceof AuthError)) toast(e.message, true);
  }
}

async function renamePath(from, to) {
  for (const t of tabs) if (t.path === from || t.path.startsWith(from + '/')) await saveTab(t);
  try {
    await api('POST', '/rename', { from, to });
    applyRename(from, to);
    await loadTree();
  } catch (e) {
    if (!(e instanceof AuthError)) toast(e.message, true);
  }
}

function applyRename(from, to) {
  for (const t of tabs) {
    if (t.path === from || t.path.startsWith(from + '/')) {
      const np = to + t.path.slice(from.length);
      if (activePath === t.path) activePath = np;
      t.path = np;
      if (t === activeTab()) view.dispatch({ effects: langConf.reconfigure(languageFor(np)) });
      else t.state = t.state.update({ effects: langConf.reconfigure(languageFor(np)) }).state;
    }
  }
  renderTabs();
  updateTitle();
  persistSession();
}

function applyDelete(path) {
  for (const t of [...tabs]) if (t.path === path || t.path.startsWith(path + '/')) { t.saved = tabContent(t); closeTab(t.path); }
}

function nodeMenu(node, e) {
  closeMenus();
  const menu = document.createElement('div');
  menu.className = 'menu node-popup';
  const dir = node.type === 'dir' ? node.path : parentOf(node.path);
  const items = [
    ['Neue Datei', () => createEntry('file', dir)],
    ['Neuer Ordner', () => createEntry('dir', dir)],
    ['Umbenennen', async () => {
      const res = await inputDialog({ title: 'Umbenennen', label: 'Neuer Name', value: node.name, ok: 'Umbenennen', icon: '✎' });
      if (res && res.value !== node.name) renamePath(node.path, joinPath(parentOf(node.path), res.value));
    }],
    ['Löschen', async () => {
      const yes = await confirmDialog({ icon: '🗑', title: 'Wirklich löschen?', text: `"${node.path}" wird endgültig gelöscht.`, ok: 'Löschen', danger: true });
      if (!yes) return;
      try {
        await api('DELETE', '/file?path=' + encodeURIComponent(node.path));
        applyDelete(node.path);
        loadTree();
      } catch (err) { if (!(err instanceof AuthError)) toast(err.message, true); }
    }],
  ];
  items.splice(2, 0, [node.type === 'dir' ? 'Als ZIP herunterladen' : 'Herunterladen', () => downloadPath(node.path)]);
  if (node.type === 'file' && isRunnable(node.path)) items.unshift(['Ausführen', async () => { await openFile(node.path); runActive(); }]);
  for (const [label, fn] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => { closeMenus(); fn(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + 'px';
  menu.style.right = 'auto';
}

function closeMenus() {
  document.querySelectorAll('.node-popup').forEach((m) => m.remove());
  $('more-menu').classList.add('hidden');
}
document.addEventListener('click', (e) => { if (!e.target.closest('.menu') && !e.target.closest('#btn-more')) closeMenus(); });

// ---------------- Sidebar & Panel ----------------

function toggleSidebar() {
  const sb = $('sidebar');
  if (isMobile()) {
    sb.classList.contains('mobile-open') ? closeSidebar() : (sb.classList.add('mobile-open'), $('backdrop').classList.remove('hidden'));
  } else {
    sb.classList.toggle('collapsed');
    store.set('sidebarCollapsed', sb.classList.contains('collapsed'));
  }
}
function closeSidebar() {
  $('sidebar').classList.remove('mobile-open');
  $('backdrop').classList.add('hidden');
}
function togglePanel(force) {
  const p = $('panel');
  const collapse = force === undefined ? !p.classList.contains('collapsed') : !force;
  p.classList.toggle('collapsed', collapse);
}

function setupResizers() {
  const sw = store.get('sidebarWidth');
  if (sw) document.documentElement.style.setProperty('--sidebar-w', sw + 'px');
  if (store.get('sidebarCollapsed') && !isMobile()) $('sidebar').classList.add('collapsed');
  const ph = store.get('panelHeight');
  if (ph && !isMobile()) $('panel').style.height = ph + 'px';

  const drag = (handle, onMove, onEnd) => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.classList.add('drag');
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => onMove(ev);
      const up = () => {
        handle.classList.remove('drag');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        onEnd();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  };
  let w = 0, h = 0;
  drag($('sidebar-resizer'), (e) => {
    w = Math.max(150, Math.min(600, e.clientX));
    document.documentElement.style.setProperty('--sidebar-w', w + 'px');
  }, () => store.set('sidebarWidth', w));
  drag($('panel-resizer'), (e) => {
    const bottom = $('panel').getBoundingClientRect().bottom;
    h = Math.max(35, Math.min(bottom - 120, bottom - e.clientY));
    $('panel').style.height = h + 'px';
    $('panel').classList.remove('collapsed');
  }, () => store.set('panelHeight', h));
}

// ---------------- Sonderzeichen-Leiste (Handy) ----------------

const KEYS = [
  ['⇥', (v) => indentMore(v) || v.dispatch(v.state.replaceSelection('    '))],
  ['←', cursorCharLeft], ['→', cursorCharRight], ['↑', cursorLineUp], ['↓', cursorLineDown],
  ...'(){}[];:"\'=<>#&|!%*/\\_+-,.'.split('').map((ch) => [ch, (v) => v.dispatch(v.state.replaceSelection(ch))]),
  ['↶', undo], ['↷', redo],
];

function setupKeys() {
  const bar = $('keys');
  for (const [label, fn] of KEYS) {
    const b = document.createElement('button');
    b.textContent = label;
    // pointerdown verhindert, dass der Editor den Fokus (und die Tastatur) verliert
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { if (activeTab()) { fn(view); view.focus(); } });
    bar.appendChild(b);
  }
  bar.classList.toggle('on', store.get('keys', matchMedia('(pointer: coarse)').matches));
}

// ---------------- Terminal & Ausführen ----------------

let ws = null;
let wsRetry = 0;
let running = false;
let runningPath = null;
const out = $('output');

function append(text, cls) {
  const atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 40;
  const last = out.lastElementChild;
  if (last && last.dataset.cls === (cls || '') && !last.dataset.linked) last.textContent += text;
  else {
    const span = document.createElement('span');
    span.dataset.cls = cls || '';
    if (cls) span.className = cls;
    span.textContent = text;
    out.appendChild(span);
  }
  // Riesige Ausgaben begrenzen
  while (out.childNodes.length > 2000) out.firstChild.remove();
  if (atBottom) out.scrollTop = out.scrollHeight;
}

// Fehlermeldungen wie "main.c:5:3: error" oder 'File "x.py", line 4' anklickbar machen
function linkifyErrors() {
  const re = /([^\s:"'`]+\.(?:c|cpp|cc|h|hpp|py)):(\d+)(?::(\d+))?|File "([^"]+)", line (\d+)/g;
  for (const span of out.querySelectorAll('span.stderr:not([data-linked])')) {
    const text = span.textContent;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    span.textContent = '';
    span.dataset.linked = '1';
    let last = 0, m;
    while ((m = re.exec(text))) {
      span.append(text.slice(last, m.index));
      const file = m[1] || m[4];
      const line = Number(m[2] || m[5]);
      const col = Number(m[3] || 1);
      const a = document.createElement('a');
      a.className = 'loc';
      a.textContent = m[0];
      a.addEventListener('click', () => gotoLocation(file, line, col));
      span.append(a);
      last = m.index + m[0].length;
    }
    span.append(text.slice(last));
  }
}

async function gotoLocation(file, line, col) {
  const all = [];
  const walk = (n) => n.forEach((x) => (x.type === 'dir' ? walk(x.children) : all.push(x.path)));
  walk(tree);
  const target = all.find((p) => p === file) || all.find((p) => file.endsWith('/' + p) || p.endsWith('/' + file));
  if (!target) return;
  await openFile(target);
  const doc = view.state.doc;
  const ln = doc.line(Math.max(1, Math.min(line, doc.lines)));
  const pos = Math.min(ln.from + col - 1, ln.to);
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  view.focus();
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    if (wsRetry > 0) { loadTree(); syncOpenTabs(); }
    wsRetry = 0;
    setConn(true);
    tabs.forEach((t) => t.error && saveTab(t));
    updateTitle();
  };
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
  ws.onclose = () => {
    setConn(false);
    if (running) finishRun('Verbindung unterbrochen');
    ws = null;
    const delay = Math.min(10000, 500 * 2 ** wsRetry++);
    setTimeout(async () => {
      const me = await fetch('/api/me').then((r) => r.json()).catch(() => null);
      if (me && !me.authed) return showLogin();
      connect();
    }, delay);
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'out': append(msg.data, msg.stream === 'stderr' ? 'stderr' : ''); break;
    case 'status': $('run-status').textContent = msg.text; break;
    case 'start': $('run-status').textContent = `${msg.lang}: ${msg.path}`; break;
    case 'exit': {
      let text;
      if (msg.error) text = msg.error;
      else if (msg.compileError) text = 'Kompilieren fehlgeschlagen';
      else if (msg.reason) text = msg.reason;
      else text = `Beendet mit Code ${msg.code}${msg.time != null ? ` (${(msg.time / 1000).toFixed(2)} s)` : ''}`;
      finishRun(text, msg.code === 0 && !msg.reason && !msg.error);
      break;
    }
    case 'changed': {
      if (msg.clientId === clientId) break;
      const tab = tabs.find((t) => t.path === msg.path);
      if (tab && !isDirty(tab) && !tab.saving && Math.abs(msg.mtime - tab.mtime) > 1) {
        api('GET', '/file?path=' + encodeURIComponent(tab.path)).then((d) => {
          if (!isDirty(tab)) replaceContent(tab, d.content, d.mtime);
        }).catch(() => {});
      }
      break;
    }
    case 'tree': clearTimeout(handleMessage.t); handleMessage.t = setTimeout(loadTree, 150); break;
    case 'renamed': applyRename(msg.from, msg.to); break;
    case 'deleted': applyDelete(msg.path); break;
  }
}

async function runActive() {
  const tab = activeTab();
  if (!tab || running) return;
  if (!isRunnable(tab.path)) return toast('Nur .py, .c und .cpp Dateien können ausgeführt werden');
  if (!ws || ws.readyState !== 1) return toast('Keine Verbindung zum Server', true);
  await saveAll();
  if (isDirty(tab)) return toast('Datei konnte nicht gespeichert werden', true);
  out.innerHTML = '';
  running = true;
  $('btn-run').classList.add('hidden');
  $('btn-stop').classList.remove('hidden');
  $('stdin-form').classList.add('active');
  togglePanel(true);
  ws.send(JSON.stringify({ type: 'run', path: tab.path }));
  $('panel').classList.add('running');
  document.body.classList.add('is-running');
  runningPath = tab.path;
  fx.burst($('btn-stop'));
  mascot.say('run');
  // Auf dem Handy direkt das Eingabefeld fokussieren, wenn das Programm input()/scanf nutzt
  const src = tabContent(tab);
  if (/\binput\s*\(|\bscanf\s*\(|\bgetchar\s*\(|\bfgets\s*\(|\bcin\s*>>/.test(src)) setTimeout(() => $('stdin').focus(), 50);
}

function finishRun(text, ok = false) {
  running = false;
  if (out.textContent && !out.textContent.endsWith('\n')) append('\n');
  append(`\n[${text}]\n`, ok ? 'ok' : 'info');
  linkifyErrors();
  $('panel').classList.remove('running');
  document.body.classList.remove('is-running');
  // Kurzes Aufleuchten des Terminals: grün bei Erfolg, rot bei Fehler
  const flash = ok ? 'flash-ok' : /gestoppt/.test(text) ? null : 'flash-err';
  if (flash) {
    $('panel').classList.remove('flash-ok', 'flash-err');
    void $('panel').offsetWidth;
    $('panel').classList.add(flash);
    setTimeout(() => $('panel').classList.remove(flash), 1400);
  }
  if (ok) {
    mascot.say('ok');
    fx.confetti();
    if (settings.playful) {
      progress.add(lastRunFailed ? 25 : 15);
      if (lastRunFailed) { toast('Bug besiegt! +25 XP ⚔️'); unlock('bugfix'); }
    }
    const runs = achievements.bump('runs');
    unlock('firstRun');
    if (/\.py$/i.test(runningPath || '')) unlock('firstPy');
    if (/\.(c|cpp|cc)$/i.test(runningPath || '')) unlock('firstC');
    if (runs >= 10) unlock('runs10');
    if (runs >= 50) unlock('runs50');
    checkNight();
  } else if (!/gestoppt/.test(text)) {
    mascot.say('error');
    fx.shake();
  } else mascot.set('idle', '', 1);
  lastRunFailed = !ok;
  $('run-status').textContent = '';
  $('btn-run').classList.remove('hidden');
  $('btn-stop').classList.add('hidden');
  $('stdin-form').classList.remove('active');
}

$('stdin-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!running || !ws) return;
  const line = $('stdin').value;
  $('stdin').value = '';
  append(line + '\n', 'stdin-echo');
  ws.send(JSON.stringify({ type: 'stdin', data: line + '\n' }));
});
$('stdin').addEventListener('keydown', (e) => {
  if (e.key === 'd' && e.ctrlKey) { e.preventDefault(); sendEof(); }
});
function sendEof() {
  if (running && ws) { ws.send('{"type":"eof"}'); append('^D\n', 'stdin-echo'); }
}

// ---------------- Downloads ----------------

// Lädt eine Datei herunter, einen Ordner als ZIP, ohne Pfad den ganzen Arbeitsbereich als ZIP
async function downloadPath(path = '') {
  for (const t of tabs) if (!path || t.path === path || t.path.startsWith(path + '/')) await saveTab(t);
  // Die Online-Demo hat keinen Server und stellt eigene Downloads bereit
  if (window.__codepadDownload) {
    try { await window.__codepadDownload(path); } catch (e) { if (e?.message) toast(e.message, true); }
    return;
  }
  const a = document.createElement('a');
  a.href = '/api/download' + (path ? '?path=' + encodeURIComponent(path) : '');
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------------- Befehlspalette ----------------

function allFiles() {
  const out = [];
  const walk = (n) => n.forEach((x) => (x.type === 'dir' ? walk(x.children) : out.push(x.path)));
  walk(tree);
  return out;
}

const KIND_COLOR = { py: 'var(--accent-3)', c: 'var(--accent-2)', cpp: 'var(--accent)', h: 'var(--accent-4)', other: 'var(--accent-5)' };

function paletteItems() {
  const files = allFiles().map((p) => ({
    group: 'Dateien', icon: iconText(p.split('/').pop()), label: p.split('/').pop(), hint: p.includes('/') ? parentOf(p) : '',
    color: KIND_COLOR[kindOf(p)], run: () => openFile(p),
  }));
  const theme = (id, name) => ({ group: 'Aussehen', icon: '◐', label: `Theme: ${name}`, color: 'var(--accent-4)', run: () => { settings.theme = id; store.set('theme2', id); applySettings(); } });
  const cmds = [
    { group: 'Befehle', icon: '▶', label: 'Ausführen', hint: 'Strg+Enter', color: 'var(--ok)', run: runActive },
    { group: 'Befehle', icon: '✦', label: 'Neue Datei …', color: 'var(--accent-5)', run: () => createEntry('file') },
    { group: 'Befehle', icon: '⌂', label: 'Neuer Ordner …', color: 'var(--accent-5)', run: () => createEntry('dir') },
    { group: 'Befehle', icon: '⌕', label: 'Im Code suchen', hint: 'Strg+F', color: 'var(--accent-2)', run: () => activeTab() && openSearchPanel(view) },
    { group: 'Befehle', icon: '☰', label: 'Explorer ein/aus', hint: 'Strg+B', color: 'var(--accent-2)', run: toggleSidebar },
    { group: 'Befehle', icon: '▭', label: 'Terminal ein/aus', hint: 'Strg+J', color: 'var(--accent-2)', run: () => togglePanel() },
    settings.playful && { group: 'Befehle', icon: '🏆', label: 'Meine Erfolge', hint: `${achievements.count()}/${Object.keys(ACHIEVEMENTS).length}`, color: 'var(--accent-3)', run: showAchievements },
    { group: 'Befehle', icon: '↓', label: 'Datei herunterladen', color: 'var(--accent-5)', run: () => activeTab() ? downloadPath(activeTab().path) : toast('Keine Datei geöffnet') },
    { group: 'Befehle', icon: '⇩', label: 'Alles als ZIP herunterladen', color: 'var(--accent-5)', run: () => downloadPath() },
    theme('koralle', 'Koralle'), theme('sakura', 'Aurora'), theme('neon', 'Neon'), theme('matcha', 'Matcha'), theme('classic', 'Klassisch'),
    { group: 'Aussehen', icon: '◇', label: `Verspielter Modus ${settings.playful ? 'aus' : 'an'}`, hint: 'Maskottchen, Effekte, Level', color: 'var(--accent-4)', run: () => toggleSetting('playful') },
  ];
  if (settings.playful) cmds.push(
    { group: 'Aussehen', icon: '✦', label: 'Effekte an/aus', color: 'var(--accent-4)', run: () => toggleSetting('fx') },
    { group: 'Aussehen', icon: '✿', label: 'Sakura-Blüten an/aus', color: 'var(--accent-4)', run: () => toggleSetting('petals') },
    { group: 'Aussehen', icon: '♡', label: 'Code-chan an/aus', color: 'var(--accent-4)', run: () => toggleSetting('mascot') },
  );
  return [...files, ...cmds.filter(Boolean)];
}

function toggleSetting(key) {
  settings[key] = !settings[key];
  store.set(key, settings[key]);
  applySettings();
  toast(`${{ fx: 'Effekte', petals: 'Sakura-Blüten', mascot: 'Code-chan', playful: 'Verspielter Modus' }[key]} ${settings[key] ? 'an' : 'aus'}`);
  renderWelcome();
}

function showAchievements() {
  openPalette(() => Object.entries(ACHIEVEMENTS).map(([id, a]) => {
    const got = achievements.got.has(id);
    return { group: 'Erfolge', icon: got ? a.icon : '🔒', label: got ? a.title : '???', hint: a.desc, color: got ? 'var(--accent-3)' : 'var(--text-dim)', run: () => {} };
  }), 'Erfolge durchsuchen …');
}

// ---------------- Willkommens-Dashboard ----------------

function renderWelcome() {
  const el = $('welcome-dash');
  if (!el || !progress) return;
  const recent = store.get('recent', []).filter((p) => allFiles().includes(p)).slice(0, 5);
  const lv = Progress.levelFor(progress.xp);
  el.innerHTML = `
    <div class="dash-actions">
      <button class="dash-card" data-new="0" style="--tc:var(--accent-3)"><b>py</b><span>Neue Python-Datei</span></button>
      <button class="dash-card" data-new="1" style="--tc:var(--accent-2)"><b>C</b><span>Neue C-Datei</span></button>
      <button class="dash-card" data-pal style="--tc:var(--accent-4)"><b>⌘K</b><span>Befehle &amp; Dateien</span></button>
      <button class="dash-card" data-zip style="--tc:var(--accent-5)"><b>ZIP</b><span>Alles herunterladen</span></button>
    </div>
    <div class="dash-stats">${settings.playful ? `
      <div><b>Lv.${lv}</b><span>Level</span></div>
      <div><b>${progress.xp}</b><span>XP</span></div>
      <div><b>${achievements.stats.runs || 0}</b><span>Läufe</span></div>
      <div><b>${achievements.count()}/${Object.keys(ACHIEVEMENTS).length}</b><span>Erfolge</span></div>` : `
      <div><b>${allFiles().length}</b><span>Dateien</span></div>
      <div><b>${achievements.stats.runs || 0}</b><span>Läufe</span></div>
      <div><b>${tabs.length}</b><span>Offene Tabs</span></div>
      <div><b>${new Set(allFiles().map((p) => kindOf(p))).size}</b><span>Sprachen</span></div>`}
    </div>
    ${recent.length ? `<div class="dash-recent"><div class="dash-label">ZULETZT GEÖFFNET</div>${recent.map((p) =>
      `<button class="dash-file" data-open="${p.replace(/"/g, '&quot;')}" style="--tc:${KIND_COLOR[kindOf(p)]}"><span class="ficon">${iconText(p.split('/').pop())}</span>${p.replace(/</g, '&lt;')}</button>`).join('')}</div>` : ''}`;
  el.querySelectorAll('[data-new]').forEach((b) => (b.onclick = () => createEntry('file', '', TEMPLATES[Number(b.dataset.new)])));
  el.querySelector('[data-pal]').onclick = () => openPalette(paletteItems);
  el.querySelector('[data-zip]').onclick = () => downloadPath();
  el.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openFile(b.dataset.open)));
}

// ---------------- Bedienelemente ----------------

$('btn-menu').addEventListener('click', toggleSidebar);
$('command-center').addEventListener('click', () => openPalette(paletteItems));
$('backdrop').addEventListener('click', closeSidebar);
$('btn-run').addEventListener('click', runActive);
$('btn-stop').addEventListener('click', () => ws && ws.send('{"type":"stop"}'));
$('btn-eof').addEventListener('click', sendEof);
$('btn-clear').addEventListener('click', () => { out.innerHTML = ''; });
$('btn-panel').addEventListener('click', () => togglePanel());
$('btn-search').addEventListener('click', () => { if (activeTab()) openSearchPanel(view); });
$('btn-new-file').addEventListener('click', () => createEntry('file'));
$('btn-new-folder').addEventListener('click', () => createEntry('dir'));
$('btn-download-all').addEventListener('click', () => downloadPath());
$('btn-refresh').addEventListener('click', () => { loadTree(); syncOpenTabs(); });
$('btn-more').addEventListener('click', () => $('more-menu').classList.toggle('hidden'));
$('panel').querySelector('.panel-head').addEventListener('dblclick', () => togglePanel());

$('more-menu').addEventListener('click', async (e) => {
  const pick = e.target.closest('[data-theme-pick]');
  if (pick) {
    settings.theme = pick.dataset.themePick;
    store.set('theme2', settings.theme);
    applySettings();
    fx.burst(pick, 10);
    return;
  }
  const action = e.target.dataset.action;
  if (!action) return;
  closeMenus();
  if (['fx', 'petals', 'mascot'].includes(action)) {
    toggleSetting(action);
  } else if (action === 'achievements') {
    showAchievements();
  } else if (action === 'font-up' || action === 'font-down') {
    fontSize = Math.max(9, Math.min(28, fontSize + (action === 'font-up' ? 1 : -1)));
    store.set('fontSize', fontSize);
    reconfigureAll(() => fontConf.reconfigure(fontTheme(fontSize)));
  } else if (action === 'wrap') {
    wrap = !wrap;
    store.set('wrap', wrap);
    reconfigureAll(() => wrapConf.reconfigure(wrap ? EditorView.lineWrapping : []));
  } else if (action === 'keys') {
    const on = $('keys').classList.toggle('on');
    store.set('keys', on);
  } else if (action === 'download') {
    const tab = activeTab();
    if (tab) downloadPath(tab.path);
    else toast('Keine Datei geöffnet');
  } else if (action === 'download-all') {
    downloadPath();
  } else if (action === 'playful') {
    toggleSetting('playful');
  } else if (action === 'logout') {
    await saveAll();
    await fetch('/api/logout', { method: 'POST' });
    location.reload();
  }
});

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'p')) { e.preventDefault(); if (started) openPalette(paletteItems); }
  else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar(); }
  else if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); togglePanel(); }
  else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveActive(); }
  else if ((mod && e.key === 'Enter') || e.key === 'F5') { e.preventDefault(); runActive(); }
  else if (e.key === 'Escape') closeMenus();
});

// Beim Zurückkehren zur App (z. B. vom PC zum Handy) neuesten Stand holen
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && started) { loadTree(); syncOpenTabs(); }
  else if (document.visibilityState === 'hidden') saveAll();
});
window.addEventListener('beforeunload', (e) => {
  if (tabs.some(isDirty)) { saveAll(); e.preventDefault(); }
});
window.addEventListener('online', () => tabs.forEach((t) => t.error && saveTab(t)));

// ---------------- Start ----------------

let started = false;

async function start() {
  if (started) return;
  started = true;
  $('app').classList.remove('hidden');
  $('mascot-home').appendChild(mascot.el);
  combo = new Combo($('editor-wrap'), (n) => {
    mascot.say('combo');
    progress.add(Math.round(n / 5));
    if (n >= 50) unlock('combo50');
    if (n >= 100) unlock('combo100');
  });
  progress = new Progress(store, onLevelUp);
  setupResizers();
  setupKeys();
  await loadTree();
  connect();
  const session = store.get('session');
  if (session && session.tabs.length) {
    for (const p of session.tabs) await openFile(p, { focus: false });
    if (session.active && tabs.some((t) => t.path === session.active)) activate(session.active, false);
  } else {
    const first = tree.find((n) => n.type === 'file');
    if (first) await openFile(first.path, { focus: false });
  }
  if (isMobile()) closeSidebar();
  updateTitle();
  renderWelcome();
  checkNight();
  bootDone();
  setTimeout(() => mascot.say('greet'), 1100);
}

applySettings();

(async () => {
  const me = await fetch('/api/me').then((r) => r.json()).catch(() => ({ authed: false }));
  if (me.authed) start(); else showLogin();
})();

if ('serviceWorker' in navigator && !window.__CODEPAD_DEMO__) navigator.serviceWorker.register('sw.js').catch(() => {});
