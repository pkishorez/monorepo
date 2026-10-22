import { EditorView } from '@codemirror/view';

/*
 * The editor in the app's own colours. Every colour is a theme variable,
 * so light and dark follow the page with nothing to switch. The text is
 * 16px so iOS does not zoom in on focus.
 */

export const theme = EditorView.theme({
  '&': {
    color: 'var(--foreground)',
    backgroundColor: 'transparent',
    fontSize: '1rem',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.625',
    maxHeight: '15rem',
    overflowY: 'auto',
  },
  '.cm-content': {
    padding: '0.5rem 1rem',
    caretColor: 'var(--foreground)',
    minHeight: '2.75rem',
  },
  '.cm-line': { padding: '0' },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: 'color-mix(in oklch, var(--ring) 35%, transparent)' },
  '.cm-atom': {
    backgroundColor: 'var(--muted)',
    borderRadius: '0.3125rem',
    boxShadow: '0 0 0 1px color-mix(in oklch, var(--border) 80%, transparent)',
    padding: '0 0.25rem',
    fontWeight: '500',
    fontSize: '0.9375em',
  },
});
