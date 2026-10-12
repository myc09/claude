// Editor-Theme: alle Farben kommen aus CSS-Variablen, damit die Themes
// (Sakura Night, Neon Tokyo, Matcha) reines CSS bleiben.

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const v = (name) => `var(--${name})`;

const editorTheme = EditorView.theme({
  '&': { color: v('ed-text'), backgroundColor: 'transparent' },
  '.cm-content': { caretColor: v('caret'), padding: '10px 0 40vh' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: `2.5px solid ${v('caret')}`, filter: `drop-shadow(0 0 4px ${v('caret')})` },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: v('selection') + ' !important' },
  '.cm-activeLine': { backgroundColor: v('active-line'), borderRadius: '6px' },
  '.cm-gutters': { backgroundColor: 'transparent', color: v('gutter'), border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: v('accent'), fontWeight: '700' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px' },
  '.cm-foldPlaceholder': { backgroundColor: v('chip'), border: 'none', color: v('accent'), borderRadius: '8px', padding: '0 6px' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: v('bracket'), outline: `1px solid ${v('accent')}`, borderRadius: '3px' },
  '.cm-searchMatch': { backgroundColor: v('search'), borderRadius: '3px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: v('accent-soft') },
  '.cm-selectionMatch': { backgroundColor: v('selection-match') },
  '.cm-tooltip': { backgroundColor: v('panel'), border: `1.5px solid ${v('accent')}`, borderRadius: '12px', overflow: 'hidden', boxShadow: `0 8px 30px ${v('shadow')}` },
  '.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px !important' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: v('accent'), color: v('on-accent') },
  '.cm-panels': { backgroundColor: v('panel'), color: v('ed-text') },
  '.cm-panels.cm-panels-top': { borderBottom: `2px solid ${v('accent')}` },
  '.cm-panels.cm-panels-bottom': { borderTop: `2px solid ${v('accent')}` },
  '.cm-panel.cm-search': { padding: '8px 10px', fontFamily: 'inherit' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { borderRadius: '999px', fontFamily: 'inherit' },
  '.cm-textfield': { backgroundColor: v('input'), border: `1.5px solid ${v('border')}`, color: v('ed-text'), padding: '4px 10px' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: v('chip'), border: 'none', color: v('ed-text'), padding: '4px 12px' },
}, { dark: true });

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: v('syn-keyword'), fontWeight: '600' },
  { tag: [t.definitionKeyword, t.modifier], color: v('syn-keyword') },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: v('syn-func') },
  { tag: [t.definition(t.variableName), t.definition(t.function(t.variableName))], color: v('syn-def') },
  { tag: [t.typeName, t.className, t.standard(t.typeName)], color: v('syn-type') },
  { tag: [t.string, t.special(t.string), t.character], color: v('syn-string') },
  { tag: [t.number, t.bool, t.null, t.atom], color: v('syn-number') },
  { tag: [t.comment, t.lineComment, t.blockComment], color: v('syn-comment'), fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.annotation], color: v('syn-meta') },
  { tag: [t.operator, t.derefOperator, t.arithmeticOperator, t.logicOperator, t.compareOperator], color: v('syn-op') },
  { tag: [t.propertyName, t.attributeName], color: v('syn-prop') },
  { tag: [t.self, t.special(t.variableName)], color: v('syn-number'), fontStyle: 'italic' },
  { tag: [t.paren, t.squareBracket, t.brace, t.punctuation, t.separator], color: v('syn-punct') },
  { tag: t.escape, color: v('syn-meta') },
  { tag: t.invalid, color: v('danger'), textDecoration: 'underline wavy' },
  { tag: t.variableName, color: v('ed-text') },
]);

export const animeTheme = [editorTheme, syntaxHighlighting(highlight)];
