// Regenbogen-Einrückung: jede Einrückungsebene bekommt ihre eigene Farbe,
// so sieht man sofort, welcher Block wozu gehört (besonders hilfreich bei Python).

import { ViewPlugin, Decoration } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const LEVELS = 5;
const marks = Array.from({ length: LEVELS }, (_, i) => Decoration.mark({ class: `cm-indent cm-indent-${i}` }));

function build(view) {
  const builder = new RangeSetBuilder();
  const unit = view.state.tabSize || 4;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;
      let width = 0, i = 0;
      while (i < text.length && (text[i] === ' ' || text[i] === '\t')) { width += text[i] === '\t' ? unit : 1; i++; }
      // Nur Leerzeichen-Einrückung in ganzen Einheiten färben
      if (i > 0 && i === width && i < text.length) {
        for (let lvl = 0; lvl * unit + unit <= i; lvl++) {
          builder.add(line.from + lvl * unit, line.from + lvl * unit + unit, marks[lvl % LEVELS]);
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const rainbowIndent = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = build(view); }
  update(u) { if (u.docChanged || u.viewportChanged) this.decorations = build(u.view); }
}, { decorations: (v) => v.decorations });
