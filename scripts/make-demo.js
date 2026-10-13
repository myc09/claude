// Baut die Online-Demo (Ordner demo/) aus public/index.html:
// gleiche Oberfläche, aber Python läuft im Browser (Pyodide) statt auf dem Server.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'demo');
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
fs.mkdirSync(path.join(out, 'pyodide'), { recursive: true });

let html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
// Die Artifact-Seite bekommt ihr eigenes Gerüst; Titel muss ganz oben stehen
// Nur Google Fonts bleibt extern; CSS und App-Code werden eingebettet
const links = head
  .split('\n')
  .filter((l) => /<link rel="(preconnect|stylesheet)"/.test(l) && !/style\.css/.test(l))
  .join('\n');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(out, 'dist', 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
html = `<title>CodePad</title>
<style>:root { color-scheme: dark; } html, body { height: 100%; background: #0a0e27; }</style>
${links}
<style>
${css}
</style>
${body.trim().replace(/<script src="dist\/app\.js"><\/script>/, () => `<script>\n${js}\n</script>`)}
`;
fs.writeFileSync(path.join(out, 'index.html'), html);

for (const f of fs.readdirSync(path.join(root, 'public', 'icons'))) {
  fs.copyFileSync(path.join(root, 'public', 'icons', f), path.join(out, 'icons', f));
}
const pyo = path.join(root, 'node_modules', 'pyodide');
for (const f of ['pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  fs.copyFileSync(path.join(pyo, f), path.join(out, 'pyodide', f));
}
console.log('Demo gebaut in', out);
