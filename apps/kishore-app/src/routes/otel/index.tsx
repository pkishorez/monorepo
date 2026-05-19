import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { Effect } from 'effect';
import { buildCollections } from './internal/collections';
import { ConfigForm } from './internal/config-form';
import { ErrorBanner } from './internal/error-banner';
import { Header } from './internal/header';
import { LotelClient, makeLotelRuntime } from './internal/runtime';
import { usePoll } from './internal/use-poll';
import { useLotelStore } from './internal/store';
import { Viewer } from './internal/viewer';

export const Route = createFileRoute('/otel/')({
  component: () => (
    <ClientOnly fallback={<div className="min-h-dvh" />}>
      <OtelRoute />
    </ClientOnly>
  ),
});

function OtelRoute() {
  const baseUrl = useLotelStore((s) => s.config.baseUrl);
  const setConfig = useLotelStore((s) => s.setConfig);

  const setBaseUrl = useCallback(
    (next: string) => setConfig({ baseUrl: next }),
    [setConfig],
  );

  if (!baseUrl) {
    return (
      <div className="min-h-dvh p-8 max-w-2xl mx-auto flex items-center">
        <ConfigForm onSubmit={setBaseUrl} />
      </div>
    );
  }

  return <Configured baseUrl={baseUrl} onChangeBaseUrl={setBaseUrl} />;
}

function Configured({
  baseUrl,
  onChangeBaseUrl,
}: {
  baseUrl: string;
  onChangeBaseUrl: (next: string) => void;
}) {
  const [resetKey, setResetKey] = useState(0);

  const runtime = useMemo(() => makeLotelRuntime(baseUrl), [baseUrl, resetKey]);
  const collections = useMemo(
    () => buildCollections(baseUrl),
    [baseUrl, resetKey],
  );

  const { error } = usePoll(collections);

  const handleClear = useCallback(async () => {
    try {
      await runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* LotelClient;
          yield* client.lotel.clearTelemetry();
        }),
      );
    } catch {
      // remount even if delete failed; user can retry
    }
    setResetKey((k) => k + 1);
  }, [runtime]);

  return (
    <>
      <style>{`html, body { overflow: hidden !important; }`}</style>
      <div className="flex h-dvh overflow-hidden flex-col gap-4 pt-6">
        <div className="px-6 max-w-7xl mx-auto w-full flex flex-col gap-4">
          <Header
            baseUrl={baseUrl}
            onChangeBaseUrl={onChangeBaseUrl}
            onClear={handleClear}
          />
          {error ? <ErrorBanner baseUrl={baseUrl} /> : null}
        </div>
        <div className="min-h-0 flex-1">
          <Viewer key={resetKey} collections={collections} />
        </div>
      </div>
    </>
  );
}
