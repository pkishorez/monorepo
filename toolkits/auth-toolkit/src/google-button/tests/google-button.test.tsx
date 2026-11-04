import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GoogleButton } from '../index.js';

describe('GoogleButton', () => {
  it('says only the words it is given, in its theme', () => {
    const html = renderToStaticMarkup(
      <GoogleButton theme="auto" label="Continue with Google" />,
    );
    expect(html).toContain('>Continue with Google</span>');
    expect(html).toContain('gsi-material-button--auto');
    expect(html).toContain('type="button"');
  });

  it('brings its own Google Sans Medium, from the computer first', () => {
    const html = renderToStaticMarkup(<GoogleButton />);
    expect(html).toMatch(
      /src: local\('Google Sans Medium'\), local\('GoogleSans-Medium'\), url\([^)]*google-sans-latin-500-normal\.woff2\) format\('woff2'\)/,
    );
    expect(html).toContain('font-display: swap');
    expect(html).toContain('>Sign in with Google</span>');
  });

  it('disables, with no busy look of its own', () => {
    const html = renderToStaticMarkup(<GoogleButton disabled />);
    expect(html).toContain('disabled=""');
    expect(html).not.toMatch(/spinner|aria-busy/i);
  });
});
