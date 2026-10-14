import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** The title and every `<meta>` and canonical in the head the server sent, by name or property. */
const head = (path: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}${path}`, { redirect: 'manual' });
    const html = await response.text();
    const part = html.slice(0, html.indexOf('</head>'));
    const tags: Record<string, string> = {};
    for (const [, key, content] of part.matchAll(
      /<meta (?:name|property)="([^"]+)" content="([^"]*)"/g,
    ))
      tags[key!] = content!;
    tags['canonical'] =
      /<link rel="canonical" href="([^"]*)"/.exec(part)?.[1] ?? '';
    tags['title'] = /<title>([^<]*)<\/title>/.exec(part)?.[1] ?? '';
    return { path, tags };
  });

export default Proof.make({
  title: "A post's title, description and share card come from the post itself",
  description:
    'The Metadata of /blog/:slug is made from its params and its Input, so each post has its own title, canonical URL and Open Graph tags in the HTML a link preview reads; /about adds an image.',
  prepare: Effect.succeed({}),
  act: () =>
    Effect.all([
      head('/blog/drawn-once'),
      head('/blog/back-is-free'),
      head('/about'),
    ]),
  verify: ([first, second, about]) =>
    Effect.gen(function* () {
      for (const [{ path, tags }, title, summary] of [
        [
          first,
          'Drawn once, per deploy',
          'Why a static page is drawn on its first visit and kept.',
        ],
        [
          second,
          'Back is free',
          'Each history entry keeps the Inputs of its places.',
        ],
      ] as const) {
        yield* Proof.assert(
          `${path}: <title>${tags['title']}`,
          tags['title'] === `${title} · Kabuki Start`,
        );
        yield* Proof.assert(
          `description and og:description are its summary`,
          tags['description'] === summary && tags['og:description'] === summary,
        );
        yield* Proof.assert(
          `og:title "${tags['og:title']}", og:type ${tags['og:type']}`,
          tags['og:title'] === title && tags['og:type'] === 'article',
        );
        yield* Proof.assert(
          `canonical and og:url ${tags['canonical']}`,
          tags['canonical'] === `https://start.kishore.app${path}` &&
            tags['og:url'] === tags['canonical'],
        );
        yield* Proof.assert(
          `og:site_name from the root: ${tags['og:site_name']}`,
          tags['og:site_name'] === 'Kabuki Start',
        );
      }
      yield* Proof.assert(
        `/about shares an image (${about.tags['og:image']}) as an article, at its canonical`,
        about.tags['og:image'] === 'https://start.kishore.app/og.png' &&
          about.tags['og:type'] === 'article' &&
          about.tags['canonical'] === 'https://start.kishore.app/about',
      );
    }),
});
