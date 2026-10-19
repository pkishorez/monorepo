import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { devtoolsCss, devtoolsModule } from '../../../scripts/devtools-css.mts';
import { css } from '../styles.gen.ts';

/* The devtools' stylesheet: kept up to date, and fit for a shadow root. */

describe('styles', () => {
  it('are built from the classes the devtools use now', async () => {
    const built = devtoolsModule(await devtoolsCss());
    const kept = readFileSync(
      new URL('../styles.gen.ts', import.meta.url),
      'utf8',
    );
    expect(kept, 'run `pnpm css` in packages/kabuki').toBe(built);
  });

  it('register no @property, which a shadow root ignores', () => {
    expect(css).not.toContain('@property');
    expect(css).toContain('--tw-border-style:solid');
  });
});
