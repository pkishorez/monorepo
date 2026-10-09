import type { ReactNode } from 'react';
import { View } from 'effect-oak/react';
import {
  Alert,
  AlertDescription,
} from '@kstackz/web-platform/components/alert';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';
import { Spinner } from '@kstackz/web-platform/components/spinner';
import { Report } from './report/index.js';
import { Weather } from './weather.js';

type Send = (
  message:
    | { readonly _tag: 'UpdatedZipCode'; readonly value: string }
    | { readonly _tag: 'SubmittedWeatherForm' },
) => void;

/** The zip code form above whatever the State shows. */
const Page = ({
  zipCode,
  loading = false,
  send,
  children,
}: {
  readonly zipCode: string;
  readonly loading?: boolean;
  readonly send: Send;
  readonly children?: ReactNode;
}) => (
  <div className="size-full overflow-y-auto p-6">
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send({ _tag: 'SubmittedWeatherForm' });
        }}
      >
        <Input
          aria-label="Zip code"
          placeholder="Enter a zip code"
          autoComplete="off"
          data-1p-ignore=""
          value={zipCode}
          onChange={(event) =>
            send({ _tag: 'UpdatedZipCode', value: event.target.value })
          }
        />
        <Button type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Get weather'}
        </Button>
      </form>
      {children}
    </div>
  </div>
);

export const WeatherView = View.make(Weather, {
  Idle: ({ model, send }) => <Page zipCode={model.zipCode} send={send} />,
  Loading: ({ model, send }) => (
    <Page zipCode={model.zipCode} loading send={send}>
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Fetching weather…
      </p>
    </Page>
  ),
  Loaded: ({ model, state, send }) => (
    <Page zipCode={model.zipCode} send={send}>
      <Report weather={state.weather} />
    </Page>
  ),
  Failed: ({ model, state, send }) => (
    <Page zipCode={model.zipCode} send={send}>
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    </Page>
  ),
});
