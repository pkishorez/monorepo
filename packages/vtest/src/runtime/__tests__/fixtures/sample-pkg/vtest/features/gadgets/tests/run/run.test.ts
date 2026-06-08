import { expect } from 'vitest';
import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe('a gadget runs', 'a gadget can be run to completion', () => {
  vtest('starts cleanly', 'a gadget starts without error', () => {
    expect(1 + 1).toBe(2);
  });
});
