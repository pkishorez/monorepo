import { EditorView } from '@codemirror/view';

/*
 * How the menu looks: a popover in the app's colours, each row the name
 * and its argument hint, then what it does on a muted second line. No
 * motion: it opens on every `/`, and keyboard-driven menus should be
 * instant.
 */

export function descriptionNode(text: string): Node {
  const node = document.createElement('span');
  node.className = 'cm-slash-description';
  node.textContent = text;
  return node;
}

export const look = EditorView.theme({
  '.cm-tooltip.cm-slash-menu': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '0.625rem',
    boxShadow:
      '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.08), 0 12px 32px rgb(0 0 0 / 0.06)',
    padding: '0.25rem',
  },
  '.cm-tooltip.cm-slash-menu > ul': {
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    maxHeight: '18rem',
    width: 'min(24rem, calc(100vw - 2rem))',
    minWidth: '16rem',
  },
  '.cm-tooltip.cm-slash-menu > ul > li': {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    alignItems: 'baseline',
    columnGap: '0.5rem',
    padding: '0.375rem 0.5rem',
    borderRadius: '0.375rem',
    lineHeight: '1.25rem',
  },
  '.cm-tooltip.cm-slash-menu > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  '.cm-tooltip.cm-slash-menu .cm-completionLabel': { fontWeight: '500' },
  '.cm-tooltip.cm-slash-menu .cm-completionMatchedText': {
    textDecoration: 'none',
    color: 'var(--foreground)',
    fontWeight: '600',
  },
  '.cm-tooltip.cm-slash-menu .cm-completionDetail': {
    marginLeft: '0',
    fontStyle: 'normal',
    fontSize: '0.75rem',
    color: 'var(--muted-foreground)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '.cm-slash-description': {
    gridColumn: '1 / -1',
    fontSize: '0.75rem',
    color: 'var(--muted-foreground)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});
