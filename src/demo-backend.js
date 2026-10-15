// Online-Demo ohne Server: ersetzt die Server-API und den WebSocket im Browser.
// Dateien liegen im localStorage, Python läuft über Pyodide (WebAssembly) direkt im Browser.
// C/C++ brauchen gcc und laufen deshalb nur mit dem echten CodePad-Server.

const FS_KEY = 'codepad.demo.fs';
const PYODIDE_URL = new URL('pyodide/', location.href).href;

const SEED = {
  'hallo.py': '# Willkommen bei CodePad!\n# Strg+Enter (oder ▶) führt den Code aus.\n\nname = input("Wie heißt du? ")\nprint(f"Hallo, {name}!")\n\nfor i in range(1, 6):\n    print(i, "zum Quadrat ist", i * i)\n',
  'sterne.py': '# Ein kleiner Sternenhimmel\nimport random\n\nfor zeile in range(6):\n    print("".join(random.choice(" ·✦✧★") for _ in range(32)))\n\nprint("\\nWie viele Sterne siehst du? ✨")\n',
  'projekte/fizzbuzz.py': 'for n in range(1, 21):\n    if n % 15 == 0:\n        print("FizzBuzz")\n    elif n % 3 == 0:\n        print("Fizz")\n    elif n % 5 == 0:\n        print("Buzz")\n    else:\n        print(n)\n',
  'hallo.c': '#include <stdio.h>\n\nint main(void) {\n    char name[64];\n    printf("Wie heisst du? ");\n    if (scanf("%63s", name) == 1)\n        printf("Hallo, %s!\\n", name);\n\n    for (int i = 1; i <= 5; i++)\n        printf("%d zum Quadrat ist %d\\n", i, i * i);\n    return 0;\n}\n',
};

// ---------------- Dateisystem im Browser ----------------

let memoryFs = null;
function loadFs() {
  if (memoryFs) return memoryFs;
  try { memoryFs = JSON.parse(localStorage.getItem(FS_KEY)); } catch { memoryFs = null; }
  if (!memoryFs || typeof memoryFs !== 'object') {
    memoryFs = { files: {}, dirs: ['projekte'] };
    const now = Date.now();
    for (const [p, content] of Object.entries(SEED)) memoryFs.files[p] = { content, mtime: now };
  }
  return memoryFs;
}
function saveFs() {
  try { localStorage.setItem(FS_KEY, JSON.stringify(memoryFs)); } catch {}
}

function clean(p) {
  return String(p || '').replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..').join('/');
}

function buildTree() {
  const fs = loadFs();
  const root = { children: new Map() };
  const ensureDir = (parts) => {
    let node = root, acc = '';
    for (const part of parts) {
      acc = acc ? acc + '/' + part : part;
      if (!node.children.has(part)) node.children.set(part, { name: part, path: acc, type: 'dir', children: new Map() });
      node = node.children.get(part);
    }
    return node;
  };
  for (const d of fs.dirs) ensureDir(d.split('/'));
  for (const p of Object.keys(fs.files)) {
    const parts = p.split('/');
    const dir = ensureDir(parts.slice(0, -1));
    dir.children.set(parts.at(-1), { name: parts.at(-1), path: p, type: 'file' });
  }
  const toArr = (node) => [...node.children.values()]
    .map((n) => (n.type === 'dir' ? { name: n.name, path: n.path, type: 'dir', children: toArr(n) } : n))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return toArr(root);
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function handleApi(method, url, body) {
  const fs = loadFs();
  const u = new URL(url, location.href);
  const route = u.pathname.replace(/^.*\/api/, '');
  if (route === '/me') return json({ authed: true, demo: true });
  if (route === '/login' || route === '/logout') return json({ ok: true });
  if (route === '/tree') return json(buildTree());
  if (route === '/file' && method === 'GET') {
    const f = fs.files[clean(u.searchParams.get('path'))];
    return f ? json(f) : json({ error: 'Datei nicht gefunden' }, 404);
  }
  if (route === '/file' && method === 'PUT') {
    const p = clean(body.path);
    const prev = fs.files[p];
    const mtime = Math.max(Date.now(), (prev?.mtime || 0) + 1);
    fs.files[p] = { content: body.content, mtime };
    saveFs();
    if (!prev) emitAll({ type: 'tree' });
    return json({ mtime });
  }
  if (route === '/create') {
    const p = clean(body.path);
    if (fs.files[p] || fs.dirs.includes(p)) return json({ error: 'Existiert bereits' }, 409);
    if (body.type === 'dir') fs.dirs.push(p);
    else fs.files[p] = { content: '', mtime: Date.now() };
    saveFs();
    return json({ ok: true });
  }
  if (route === '/rename') {
    const from = clean(body.from), to = clean(body.to);
    if (fs.files[to] || fs.dirs.includes(to)) return json({ error: 'Ziel existiert bereits' }, 409);
    for (const p of Object.keys(fs.files)) {
      if (p === from || p.startsWith(from + '/')) { fs.files[to + p.slice(from.length)] = fs.files[p]; delete fs.files[p]; }
    }
    fs.dirs = fs.dirs.map((d) => (d === from || d.startsWith(from + '/') ? to + d.slice(from.length) : d));
    saveFs();
    return json({ ok: true });
  }
  if (route === '/file' && method === 'DELETE') {
    const p = clean(u.searchParams.get('path'));
    for (const k of Object.keys(fs.files)) if (k === p || k.startsWith(p + '/')) delete fs.files[k];
    fs.dirs = fs.dirs.filter((d) => d !== p && !d.startsWith(p + '/'));
    saveFs();
    return json({ ok: true });
  }
  return json({ error: 'Unbekannt' }, 404);
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/^\/?api\//.test(url) || url.startsWith(location.origin + '/api/')) {
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch {}
    return handleApi((init.method || 'GET').toUpperCase(), url, body);
  }
  return realFetch(input, init);
};

// ---------------- Python über Pyodide ----------------

let pyodidePromise = null;
// Die Skripte kommen vom CDN, die großen Dateien (WASM, Standardbibliothek) liegen neben der Seite.
const PYODIDE_CDN = 'https://cdn.jsdelivr.net/npm/pyodide@0.26.4/';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`${src.split('/').pop()} konnte nicht geladen werden`));
    document.head.appendChild(s);
  });
}

function loadPython(onStatus) {
  if (!pyodidePromise) {
    onStatus('Lade Python … (einmalig ~12 MB)');
    pyodidePromise = (async () => {
      await loadScript(PYODIDE_CDN + 'pyodide.js');
      await loadScript(PYODIDE_CDN + 'pyodide.asm.js');
      // Die Standardbibliothek liegt als .wasm-Datei bereit (ZIP-Dateien werden dort nicht ausgeliefert)
      return window.loadPyodide({ indexURL: PYODIDE_URL, stdLibURL: PYODIDE_URL + 'python_stdlib.wasm' });
    })().catch((e) => { pyodidePromise = null; throw e; });
  }
  return pyodidePromise;
}

// Ersetzt input(): Zeile aus dem Terminal, EOFError bei Strg+D, sonst Pause bis zur Eingabe.
// CodePadNeedInput erbt von BaseException, damit "except Exception" im Nutzercode sie nicht abfängt.
const INPUT_SHIM = `
import builtins as _b
from codepad_io import next_line as _next
class CodePadNeedInput(BaseException):
    pass
def _cp_input(prompt=""):
    import sys
    if prompt:
        sys.stdout.write(str(prompt))
        sys.stdout.flush()
    v = _next()
    if v is None:
        raise EOFError("EOF when reading a line")
    if v is False:
        raise CodePadNeedInput()
    return v
_b.input = _cp_input
del _b
`;

// Entfernt Pyodide-interne Einträge (samt ihrer Code-Zeilen) aus dem Traceback
function cleanTraceback(text) {
  const out = [];
  let skip = false;
  for (const line of text.split('\n')) {
    const frame = line.match(/^  File "([^"]+)"/);
    if (frame) skip = /^\/lib\/python|_pyodide|^<exec>$/.test(frame[1]);
    else if (!line.startsWith('    ')) skip = false;
    if (!skip) out.push(line);
  }
  return out.join('\n');
}

const sockets = new Set();
let currentRun = null;
function emitAll(msg) { for (const s of sockets) s._emit(msg); }

// Ein Programmlauf. input() wird so gelöst: Fehlt eine Eingabe, hält der Lauf an und
// wartet auf das Terminal-Feld. Danach läuft das Programm mit allen bisherigen Eingaben
// erneut (gleicher Zufalls-Seed) und zeigt nur die neue Ausgabe.
class DemoRun {
  constructor(sock, path) {
    this.sock = sock;
    this.path = path;
    this.inputs = [];
    this.eof = false;
    this.shown = 0;
    this.seed = Math.floor(Math.random() * 1e9);
    this.started = performance.now();
  }

  async start() {
    const ext = this.path.split('.').pop().toLowerCase();
    const lang = { py: 'Python', c: 'C', cpp: 'C++', cc: 'C++' }[ext];
    this.sock._emit({ type: 'start', path: this.path, lang: lang || '?' });
    if (ext !== 'py') {
      this.sock._emit({ type: 'out', stream: 'stderr', data: 'C und C++ brauchen den Compiler (gcc) auf dem CodePad-Server.\nIn dieser Online-Demo läuft nur Python. Starte CodePad auf deinem PC, dann geht auch C.\n' });
      return this.finish({ code: -1, reason: 'Nur mit Server verfügbar' });
    }
    try {
      this.py = await loadPython((t) => this.sock._emit({ type: 'status', text: t }));
      this.py.registerJsModule('codepad_io', { next_line: () => currentRun?.nextInput() });
    } catch (e) {
      this.sock._emit({ type: 'out', stream: 'stderr', data: `Python konnte nicht geladen werden: ${e.message}\n` });
      return this.finish({ code: -1, reason: 'Python nicht verfügbar' });
    }
    this.execute();
  }

  execute() {
    if (this.done) return;
    currentRun = this;
    const py = this.py;
    const content = loadFs().files[this.path]?.content ?? '';
    let out = '';
    const bytes = [];
    const flush = () => { if (bytes.length) { out += new TextDecoder().decode(new Uint8Array(bytes.splice(0))); } };
    let idx = 0;
    let needInput = false;
    py.setStdout({ raw: (c) => { bytes.push(c); } });
    py.setStderr({ raw: (c) => { bytes.push(c); } });
    // input() holt Zeilen aus dem Terminal-Feld; fehlt eine, hält der Lauf an
    this.nextInput = () => {
      if (idx < this.inputs.length) return this.inputs[idx++];
      if (this.eof) return null;
      needInput = true;
      return false;
    };
    py.setStdin({ stdin: () => null });
    this.sock._emit({ type: 'status', text: 'Läuft …' });
    let result = { code: 0 };
    // Jeder Lauf bekommt frische Variablen, wie ein neuer Prozess
    const globals = py.globals.get('dict')();
    globals.set('__name__', '__main__');
    try {
      py.runPython(`import random as __r, sys as __s\n__r.seed(${this.seed})\n__s.argv = [${JSON.stringify(this.path)}]\ndel __r, __s`);
      py.runPython(INPUT_SHIM);
      py.runPython(content, { globals, filename: this.path });
    } catch (e) {
      flush();
      if (needInput) {
        this.emitNew(out);
        this.sock._emit({ type: 'status', text: 'Wartet auf Eingabe … ⌨' });
        return; // weiter, sobald eine Zeile kommt
      }
      // Python-Fehler: Traceback ohne interne Pyodide-Zeilen ausgeben
      const msg = cleanTraceback(String(e.message || e));
      this.emitNew(out);
      this.sock._emit({ type: 'out', stream: 'stderr', data: msg.endsWith('\n') ? msg : msg + '\n' });
      result = { code: 1 };
      return this.finish(result);
    }
    finally {
      globals.destroy();
    }
    flush();
    this.emitNew(out);
    this.finish(result);
  }

  emitNew(out) {
    if (out.length > this.shown) {
      this.sock._emit({ type: 'out', stream: 'stdout', data: out.slice(this.shown) });
      this.shown = out.length;
    }
  }

  input(line) {
    if (this.done) return;
    this.inputs.push(line.replace(/\n$/, ''));
    // Die Eingabe selbst steht schon im Terminal; bei der Wiederholung nicht doppelt zeigen
    setTimeout(() => this.execute(), 0);
  }

  endInput() { this.eof = true; setTimeout(() => this.execute(), 0); }

  finish({ code, reason }) {
    if (this.done) return;
    this.done = true;
    this.sock._emit({ type: 'exit', code, reason, time: Math.round(performance.now() - this.started) });
    this.sock.run = null;
  }

  stop() { this.finish({ code: -1, reason: 'Vom Benutzer gestoppt' }); }
}

class DemoSocket {
  constructor() {
    this.readyState = 0;
    this.run = null;
    sockets.add(this);
    setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 30);
  }
  _emit(msg) { if (this.readyState === 1) setTimeout(() => this.onmessage?.({ data: JSON.stringify(msg) }), 0); }
  send(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'run') {
      if (this.run) return;
      this.run = new DemoRun(this, clean(msg.path));
      this.run.start();
    } else if (msg.type === 'stdin') this.run?.input(String(msg.data));
    else if (msg.type === 'eof') this.run?.endInput();
    else if (msg.type === 'stop') this.run?.stop();
  }
  close() { this.readyState = 3; sockets.delete(this); }
}
window.WebSocket = DemoSocket;

// ---------------- Downloads in der Demo ----------------
// Der Download-Dialog der Seite erlaubt nur bestimmte Endungen (kein .py/.c),
// deshalb kommt jede Auswahl als ZIP, das die Dateien mit Originalnamen enthält.

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(entries) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const { name, content } of entries) {
    const n = enc.encode(name), d = enc.encode(content), crc = crc32(d);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
    head.setUint32(14, crc, true); head.setUint32(18, d.length, true); head.setUint32(22, d.length, true);
    head.setUint16(26, n.length, true);
    parts.push(head.buffer, n, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true);
    c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
    central.push(c.buffer, n);
    offset += 30 + n.length + d.length;
  }
  const size = central.reduce((s, b) => s + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

window.__codepadDownload = async (rawPath) => {
  const p = clean(rawPath);
  const files = loadFs().files;
  const picked = Object.keys(files).filter((k) => !p || k === p || k.startsWith(p + '/'));
  if (!picked.length) throw new Error('Nichts zum Herunterladen gefunden');
  const base = p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
  const entries = picked.map((k) => ({ name: files[p] ? k.split('/').pop() : k.slice(base.length), content: files[k].content }));
  const filename = (p ? p.split('/').pop() : 'codepad-workspace') + '.zip';
  const downloads = window.claude?.use ? await window.claude.use('downloads') : null;
  if (!downloads) throw new Error('Downloads sind in dieser Ansicht nicht verfügbar');
  try {
    await downloads.save({ filename, data: zipStore(entries) });
  } catch (e) {
    if (e?.code === 'declined') return;
    if (e?.code === 'rate_limited') throw new Error('Gerade läuft schon ein Download. Versuch es gleich noch einmal.');
    throw new Error('Download nicht möglich');
  }
};
window.__CODEPAD_DEMO__ = true;
