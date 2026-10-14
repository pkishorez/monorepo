import { Card, CardContent } from '@kestack/web-platform/components/card';
import { Page } from '../../parts/index.ts';

const READING = [
  [
    'mode',
    'the Render Mode the Routes give the place: static, dynamic or client.',
  ],
  [
    'drawn by',
    'the server, if the place was in the page the server sent, with the time it drew it and its build; the browser, after a move or for a client place.',
  ],
  [
    'input',
    'when the Loader ran, and whether its answer came with the page or was fetched by the browser from /_kabuki/load.',
  ],
] as const;

/** Static with no Input; its Metadata has Open Graph and a canonical URL. */
export const About = () => (
  <Page
    place="About"
    title="About this site"
    intro="A Kabuki app served by Kabuki Start from one Cloudflare Worker, with a pretend backend in the Worker's memory."
  >
    <Card className="max-w-2xl">
      <CardContent>
        <dl className="divide-y divide-border">
          {READING.map(([term, meaning]) => (
            <div
              key={term}
              className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[7rem_1fr] sm:gap-4"
            >
              <dt className="font-mono text-sm font-medium">{term}</dt>
              <dd className="text-muted-foreground">{meaning}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  </Page>
);
