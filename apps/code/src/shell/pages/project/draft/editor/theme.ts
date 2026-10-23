import { EditorView } from '@codemirror/view';

/*
 * The editor in the app's own colours, set as a sent message's words are.
 * Every colour is a theme variable, so light and dark follow the page with
 * nothing to switch. The text is 16px so iOS does not zoom in on focus.
 * The cursor shows without focus too, still, so the Draft says where the
 * next insert goes; it blinks only in the Composer. A Dictation's
 * placeholder is quiet, italic, and its retry reads as a link.
 */

export const theme = EditorView.theme({
  // Its card says how bright its words are: muted while read only.
  '&': {
    color: 'inherit',
    backgroundColor: 'transparent',
    fontSize: '1rem',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.75' },
  '.cm-content': {
    padding: '0',
    caretColor: 'var(--foreground)',
    minHeight: '1.75rem',
  },
  '.cm-line': { padding: '0' },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  '.cm-cursorLayer .cm-cursor': {
    display: 'block',
    borderLeftColor: 'var(--foreground)',
  },
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
  '.cm-dictation': {
    color: 'var(--muted-foreground)',
    fontStyle: 'italic',
    fontSize: '0.9375em',
    padding: '0 0.125rem',
  },
  '.cm-dictation[data-failed] button': {
    color: 'var(--destructive)',
    fontStyle: 'normal',
    textDecoration: 'underline',
    textUnderlineOffset: '4px',
    cursor: 'pointer',
  },
});
