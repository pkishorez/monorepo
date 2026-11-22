import { describe, expect, it } from 'vitest';

import { selectionAction } from '../index.js';

/* The selection bar's one button, named by what it stands for. */

describe('the selection bar', () => {
  it('opens a Package or a file', () => {
    expect(selectionAction({ kind: 'package' }, true)).toBe('Open package');
    expect(selectionAction({ kind: 'file' }, false)).toBe('Open file');
  });

  it("views a folder's changes while Changes is on, else browses its files", () => {
    expect(selectionAction({ kind: 'folder' }, true)).toBe('View changes');
    expect(selectionAction({ kind: 'folder' }, false)).toBe('Browse files');
  });
});
