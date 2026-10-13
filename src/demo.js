// Einstieg für die Online-Demo: erst den Browser-Ersatz für den Server laden, dann die App.
import './demo-backend.js';
import './main.js';

const badge = document.createElement('span');
badge.className = 'demo-badge';
badge.title = 'Online-Demo: Dateien bleiben in diesem Browser, nur Python läuft. Mit dem CodePad-Server gehen auch C, C++ und die Synchronisierung.';
badge.textContent = 'DEMO';
document.querySelector('.topbar .brand')?.after(badge);
document.querySelector('[data-action="download"]')?.remove();
document.querySelector('[data-action="logout"]')?.remove();
