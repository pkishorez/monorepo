import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import {
  Card,
  CardContent,
  CardHeader,
} from '@kestack/web-platform/components/card';
import { Input } from '@kestack/web-platform/components/input';
import { PageFrame, link } from '../../../components/index.ts';
import { Routes } from '../../../../shared/index.ts';
import { PlaygroundActor } from './playground.ts';

/*
 * The playground's View, in a chunk of its own: everything the Routes say
 * of a URL, worked out as it is typed.
 */

const EXAMPLES = [
  '/',
  '/blog/drawn-once',
  '/posts/back-is-free',
  '/docs/playground',
  '/account/settings',
  '/dashboard/reports/traffic',
  '/shop/cart?coupon=1',
  '/nowhere',
] as const;

const json = (value: unknown) => JSON.stringify(value, null, 2);

const Panel = ({
  title,
  value,
}: {
  readonly title: string;
  readonly value: unknown;
}) => (
  <Card size="sm" className="min-w-0">
    <CardHeader>
      <h2 className="text-sm font-medium">{title}</h2>
    </CardHeader>
    <CardContent>
      <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 font-mono text-xs leading-relaxed">
        {json(value)}
      </pre>
    </CardContent>
  </Card>
);

export default View.make(PlaygroundActor, ({ model, send, root }) => {
  const read = Routes.read(model.url);
  const places =
    read._tag === 'At'
      ? Routes.places(read.route).map(({ name, render, input }) => ({
          name,
          render,
          loader: input !== undefined,
        }))
      : [];
  return (
    <div {...root}>
      <PageFrame
        place="Docs.Playground"
        title="Playground"
        intro="Type a URL: the same Routes the Worker reads tell you the Route, the places it names and how each is drawn."
      >
        <div className="space-y-3">
          <Input
            aria-label="URL"
            value={model.url}
            spellCheck={false}
            onChange={(event) =>
              send({ _tag: 'UrlTyped', url: event.target.value })
            }
            className="h-10 font-mono"
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((url) => (
              <Button
                key={url}
                variant={url === model.url ? 'secondary' : 'outline'}
                size="xs"
                onClick={() => send({ _tag: 'UrlTyped', url })}
                className="font-mono"
              >
                {url}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Route" value={read} />
          <Panel title="Places" value={places} />
          <Panel
            title="Metadata, before any Input"
            value={read._tag === 'At' ? Routes.metadata(read.route) : null}
          />
        </div>
        <Router.Link to={Routes.Docs.Index()} className={`${link} text-sm`}>
          All docs
        </Router.Link>
      </PageFrame>
    </div>
  );
});
