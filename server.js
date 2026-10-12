'use strict';
// CodePad – Server: liefert die App aus, speichert die Dateien zentral
// (damit sie auf Handy und PC gleich sind) und führt Python- und C-Code aus.

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const WORKSPACE = path.resolve(process.env.WORKSPACE || path.join(__dirname, 'workspace'));
const RUN_TIMEOUT = (Number(process.env.RUN_TIMEOUT) || 60) * 1000;
const MAX_OUTPUT = 2 * 1024 * 1024;
const MAX_FILE = 5 * 1024 * 1024;
const DATA_DIR = path.join(WORKSPACE, '.codepad');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'public', 'dist', 'app.js'))) {
  console.error('Die Oberfläche ist noch nicht gebaut. Bitte zuerst "npm run build" ausführen.');
  process.exit(1);
}

// ---------- Passwort & Sitzungen ----------

let PASSWORD = process.env.PASSWORD;
if (!PASSWORD) {
  const pwFile = path.join(DATA_DIR, 'password');
  if (fs.existsSync(pwFile)) {
    PASSWORD = fs.readFileSync(pwFile, 'utf8').trim();
  } else {
    PASSWORD = crypto.randomBytes(6).toString('base64url');
    fs.writeFileSync(pwFile, PASSWORD + '\n', { mode: 0o600 });
  }
  console.log(`Kein PASSWORD gesetzt – Passwort: ${PASSWORD}  (gespeichert in ${pwFile})`);
}

const saltFile = path.join(DATA_DIR, 'secret');
if (!fs.existsSync(saltFile)) fs.writeFileSync(saltFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
// Ändert sich das Passwort, werden alle alten Sitzungen ungültig.
const SECRET = crypto.createHash('sha256').update(fs.readFileSync(saltFile, 'utf8') + PASSWORD).digest();
const SESSION_DAYS = 60;

function makeToken() {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const sig = crypto.createHmac('sha256', SECRET).update(String(exp)).digest('base64url');
  return `${exp}.${sig}`;
}

function validToken(token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(exp).digest('base64url');
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const isAuthed = (req) => validToken(getCookie(req, 'codepad'));

// ---------- Dateisystem ----------

function resolvePath(rel) {
  if (typeof rel !== 'string') throw httpError(400, 'Pfad fehlt');
  const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(WORKSPACE, clean);
  if (abs !== WORKSPACE && !abs.startsWith(WORKSPACE + path.sep)) throw httpError(400, 'Ungültiger Pfad');
  if (clean.split('/')[0] === '.codepad') throw httpError(403, 'Geschützter Ordner');
  return abs;
}

const relPath = (abs) => path.relative(WORKSPACE, abs).split(path.sep).join('/');

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function readTree(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.name === '.codepad' && dir === WORKSPACE) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push({ name: e.name, path: relPath(abs), type: 'dir', children: await readTree(abs) });
    else if (e.isFile()) out.push({ name: e.name, path: relPath(abs), type: 'file' });
  }
  out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return out;
}

function seedWorkspace() {
  const entries = fs.readdirSync(WORKSPACE).filter((n) => n !== '.codepad');
  if (entries.length) return;
  fs.writeFileSync(path.join(WORKSPACE, 'hallo.py'),
    `# Willkommen bei CodePad!\n# Strg+Enter (oder ▶) führt den Code aus.\n\nname = input("Wie heißt du? ")\nprint(f"Hallo, {name}!")\n\nfor i in range(1, 6):\n    print(i, "zum Quadrat ist", i * i)\n`);
  fs.writeFileSync(path.join(WORKSPACE, 'hallo.c'),
    `#include <stdio.h>\n\nint main(void) {\n    char name[64];\n    printf("Wie heisst du? ");\n    if (scanf("%63s", name) == 1)\n        printf("Hallo, %s!\\n", name);\n\n    for (int i = 1; i <= 5; i++)\n        printf("%d zum Quadrat ist %d\\n", i, i * i);\n    return 0;\n}\n`);
}
seedWorkspace();

// ---------- HTTP ----------

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

app.post('/api/login', async (req, res) => {
  const pw = String(req.body?.password || '');
  const a = crypto.createHash('sha256').update(pw).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 800)); // bremst Rateversuche
    return res.status(401).json({ error: 'Falsches Passwort' });
  }
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie',
    `codepad=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'codepad=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ authed: isAuthed(req) }));

const api = express.Router();
api.use((req, res, next) => (isAuthed(req) ? next() : res.status(401).json({ error: 'Nicht angemeldet' })));

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

api.get('/tree', wrap(async (req, res) => res.json(await readTree(WORKSPACE))));

api.get('/file', wrap(async (req, res) => {
  const abs = resolvePath(req.query.path);
  const st = await fsp.stat(abs).catch(() => null);
  if (!st || !st.isFile()) throw httpError(404, 'Datei nicht gefunden');
  if (st.size > MAX_FILE) throw httpError(413, 'Datei zu groß');
  res.json({ content: await fsp.readFile(abs, 'utf8'), mtime: st.mtimeMs });
}));

api.put('/file', wrap(async (req, res) => {
  const { path: rel, content, baseMtime, clientId } = req.body || {};
  if (typeof content !== 'string') throw httpError(400, 'Inhalt fehlt');
  const abs = resolvePath(rel);
  const st = await fsp.stat(abs).catch(() => null);
  // Konflikt: Datei wurde inzwischen auf einem anderen Gerät geändert.
  if (st && baseMtime != null && Math.abs(st.mtimeMs - baseMtime) > 1) {
    return res.status(409).json({ error: 'Konflikt', mtime: st.mtimeMs, content: await fsp.readFile(abs, 'utf8') });
  }
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, abs);
  const mtime = (await fsp.stat(abs)).mtimeMs;
  broadcast({ type: 'changed', path: relPath(abs), mtime, clientId });
  if (!st) broadcast({ type: 'tree' });
  res.json({ mtime });
}));

api.post('/create', wrap(async (req, res) => {
  const { path: rel, type } = req.body || {};
  const abs = resolvePath(rel);
  if (fs.existsSync(abs)) throw httpError(409, 'Existiert bereits');
  if (type === 'dir') await fsp.mkdir(abs, { recursive: true });
  else {
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, '');
  }
  broadcast({ type: 'tree' });
  res.json({ ok: true });
}));

api.post('/rename', wrap(async (req, res) => {
  const from = resolvePath(req.body?.from);
  const to = resolvePath(req.body?.to);
  if (from === WORKSPACE) throw httpError(400, 'Ungültig');
  if (fs.existsSync(to)) throw httpError(409, 'Ziel existiert bereits');
  await fsp.mkdir(path.dirname(to), { recursive: true });
  await fsp.rename(from, to);
  broadcast({ type: 'tree' });
  broadcast({ type: 'renamed', from: relPath(from), to: relPath(to) });
  res.json({ ok: true });
}));

api.delete('/file', wrap(async (req, res) => {
  const abs = resolvePath(req.query.path);
  if (abs === WORKSPACE) throw httpError(400, 'Ungültig');
  await fsp.rm(abs, { recursive: true, force: true });
  broadcast({ type: 'tree' });
  broadcast({ type: 'deleted', path: relPath(abs) });
  res.json({ ok: true });
}));

app.use('/api', api);
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, p) => {
    if (p.endsWith('sw.js') || p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Serverfehler' });
});

// ---------- Code ausführen ----------

// Wird mitkompiliert, damit printf sofort erscheint (wichtig für Eingaben mit scanf).
const PRELUDE = path.join(os.tmpdir(), 'codepad-prelude.c');
fs.writeFileSync(PRELUDE,
  '#include <stdio.h>\n__attribute__((constructor)) static void codepad_unbuffer(void) {\n' +
  '  setvbuf(stdout, NULL, _IONBF, 0);\n  setvbuf(stderr, NULL, _IONBF, 0);\n}\n');

const LANGS = {
  '.py': { name: 'Python', run: (file) => [process.env.PYTHON || 'python3', ['-u', file]] },
  '.c': { name: 'C', compile: (file, out) => [process.env.CC || 'gcc', ['-std=c17', '-Wall', '-g', '-O0', '-fdiagnostics-color=never', file, PRELUDE, '-o', out, '-lm']] },
  '.cpp': { name: 'C++', compile: (file, out) => [process.env.CXX || 'g++', ['-std=c++20', '-Wall', '-g', '-O0', '-fdiagnostics-color=never', file, PRELUDE, '-o', out, '-lm']] },
};
LANGS['.cc'] = LANGS['.cpp'];

class Runner {
  constructor(send) {
    this.send = send;
    this.proc = null;
    this.interactive = null;
    this.pending = [];
  }

  spawn(cmd, args, cwd, { interactive }) {
    return new Promise((resolve) => {
      const started = Date.now();
      let bytes = 0;
      let reason = null;
      let proc;
      try {
        proc = spawn(cmd, args, { cwd, detached: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      } catch (e) {
        this.send({ type: 'out', stream: 'stderr', data: `Konnte ${cmd} nicht starten: ${e.message}\n` });
        return resolve({ code: -1 });
      }
      this.proc = proc;
      const kill = (why) => {
        reason = reason || why;
        try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch {} }
      };
      this.kill = kill;
      const timer = setTimeout(() => kill(`Zeitlimit von ${RUN_TIMEOUT / 1000}s überschritten`), RUN_TIMEOUT);
      const onData = (stream) => (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_OUTPUT) return kill('Zu viel Ausgabe (über 2 MB)');
        // Absolute Serverpfade kürzen: "/srv/workspace/a/b.c:3:1" -> "a/b.c:3:1"
        const data = chunk.split(WORKSPACE + path.sep).join('');
        this.send({ type: 'out', stream, data });
      };
      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');
      proc.stdout.on('data', onData('stdout'));
      proc.stderr.on('data', onData('stderr'));
      proc.stdin.on('error', () => {});
      if (!interactive) proc.stdin.end();
      else {
        // Eingaben, die schon während des Kompilierens getippt wurden
        this.interactive = proc;
        for (const d of this.pending) d === null ? proc.stdin.end() : proc.stdin.write(d);
        this.pending = [];
      }
      proc.on('error', (e) => {
        this.send({ type: 'out', stream: 'stderr', data: `Konnte ${cmd} nicht starten: ${e.message}\n` });
      });
      proc.on('close', (code, signal) => {
        clearTimeout(timer);
        this.proc = null;
        this.interactive = null;
        resolve({ code: code ?? -1, signal, reason, time: Date.now() - started });
      });
    });
  }

  async run(rel) {
    if (this.proc) return this.send({ type: 'out', stream: 'stderr', data: 'Es läuft bereits ein Programm.\n' });
    let abs;
    try { abs = resolvePath(rel); } catch (e) { return this.send({ type: 'exit', code: -1, error: e.message }); }
    const lang = LANGS[path.extname(abs).toLowerCase()];
    if (!lang) return this.send({ type: 'exit', code: -1, error: 'Nur .py, .c und .cpp Dateien können ausgeführt werden.' });
    if (!fs.existsSync(abs)) return this.send({ type: 'exit', code: -1, error: 'Datei nicht gefunden' });

    const cwd = path.dirname(abs);
    this.cancelled = false;
    this.pending = [];
    this.send({ type: 'start', path: rel, lang: lang.name });
    let binDir = null;
    try {
      let cmd, args;
      if (lang.compile) {
        binDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'codepad-'));
        const bin = path.join(binDir, 'program');
        this.send({ type: 'status', text: 'Kompiliere …' });
        const [cc, ccArgs] = lang.compile(abs, bin);
        const res = await this.spawn(cc, ccArgs, cwd, { interactive: false });
        if (res.code !== 0 || this.cancelled) {
          return this.send({ type: 'exit', code: res.code, compileError: !this.cancelled, reason: res.reason });
        }
        [cmd, args] = [bin, []];
      } else {
        [cmd, args] = lang.run(abs);
      }
      this.send({ type: 'status', text: 'Läuft …' });
      const res = await this.spawn(cmd, args, cwd, { interactive: true });
      this.send({ type: 'exit', code: res.code, signal: res.signal, reason: res.reason, time: res.time });
    } finally {
      if (binDir) fsp.rm(binDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  stdin(data) {
    if (this.interactive) { if (this.interactive.stdin.writable) this.interactive.stdin.write(data); }
    else if (this.proc) this.pending.push(data);
  }

  eof() {
    if (this.interactive) this.interactive.stdin.end();
    else if (this.proc) this.pending.push(null);
  }

  stop() {
    this.cancelled = true;
    if (this.proc && this.kill) this.kill('Vom Benutzer gestoppt');
  }
}

// ---------- WebSocket ----------

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send(data);
}

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws') || !isAuthed(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  const runner = new Runner((msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg)));
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'run') runner.run(msg.path);
    else if (msg.type === 'stdin') runner.stdin(String(msg.data));
    else if (msg.type === 'eof') runner.eof();
    else if (msg.type === 'stop') runner.stop();
    else if (msg.type === 'ping') ws.send('{"type":"pong"}');
  });
  ws.on('close', () => runner.stop());
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`CodePad läuft auf http://localhost:${PORT}`);
  console.log(`Arbeitsordner: ${WORKSPACE}`);
});
