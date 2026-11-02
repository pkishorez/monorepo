import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MarkdownViewer } from './markdown-viewer';

/*
 * An image reaches what draws it as written, whatever its scheme; one it
 * leaves is drawn as markdown draws it, its address made safe.
 */

it('hands an image to `image` with its address as written', () => {
  const seen: Array<string> = [];
  const markup = renderToStaticMarkup(
    <MarkdownViewer
      image={({ src, alt }) => {
        seen.push(`${alt}|${src}`);
        return src.startsWith('files:') ? <span>drawn</span> : undefined;
      }}
    >
      {
        'See ![The chart](files:out/chart.png) and ![A logo](https://x.test/a.png)'
      }
    </MarkdownViewer>,
  );
  expect(seen).toEqual([
    'The chart|files:out/chart.png',
    'A logo|https://x.test/a.png',
  ]);
  expect(markup).toContain('<span>drawn</span>');
  expect(markup).toContain('src="https://x.test/a.png"');
});

it('makes an address it does not know safe where nothing draws it', () => {
  const markup = renderToStaticMarkup(
    <MarkdownViewer>
      {'![x](javascript:alert(1)) [y](javascript:alert(2))'}
    </MarkdownViewer>,
  );
  expect(markup).not.toContain('javascript:');
});
