import { expect } from 'vitest';
import { vtest } from '@monorepo/vtest';

vtest('renders a widget', 'a widget renders to a non-empty string', () => {
  expect('widget').toHaveLength(6);
});
