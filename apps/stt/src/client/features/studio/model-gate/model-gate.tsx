import { Effect } from 'effect';
import { useEffect, useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from 'kui-toolkit/components/ui/card';
import { Progress } from 'kui-toolkit/components/ui/progress';
import {
  clearModelCache,
  readModelCaches,
  speechModels,
  type ModelCache,
} from '../../../../engine/models/index.ts';
import { useDownloadRate } from './download-rate.ts';

/** First screen on every visit: nothing downloads until a model is picked. */
export function ModelPicker({
  onChoose,
}: {
  readonly onChoose: (model: string) => void;
}) {
  const [caches, setCaches] = useState<ReadonlyMap<string, ModelCache>>(
    () => new Map(),
  );
  useEffect(() => {
    void Effect.runPromise(readModelCaches).then(setCaches);
  }, []);

  return (
    <section className="mx-auto w-full max-w-md space-y-3">
      <h2 className="px-1 text-sm text-muted-foreground">Choose a model</h2>
      <ul className="divide-y rounded-lg border bg-card">
        {speechModels.map((model) => {
          const cached = caches.get(model.id)?.state ?? 'none';
          const heldBytes = caches.get(model.id)?.bytes ?? 0;
          return (
            <li key={model.id} className="flex items-center">
              <button
                type="button"
                className="flex flex-1 items-baseline gap-3 py-3.5 pr-2 pl-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
                onClick={() => onChoose(model.id)}
              >
                <span className="text-sm font-medium">{model.label}</span>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {model.note}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {cached === 'downloaded'
                    ? 'Downloaded'
                    : cached === 'partial'
                      ? `${megabytes(heldBytes)} of ${model.downloadMegabytes} MB`
                      : `${model.downloadMegabytes} MB`}
                </span>
              </button>
              {cached === 'none' ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-2 text-muted-foreground"
                  aria-label={`Clear ${model.label} from this browser`}
                  onClick={() => {
                    void Effect.runPromise(
                      clearModelCache(model.id).pipe(
                        Effect.ignore,
                        Effect.andThen(readModelCaches),
                      ),
                    ).then(setCaches);
                  }}
                >
                  Clear
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-xs text-muted-foreground">
        English only. Runs on your device; nothing you say leaves the page.
      </p>
    </section>
  );
}

const megabytes = (bytes: number): string => (bytes / 1_000_000).toFixed(0);

/** Locked screen while the model downloads and warms up. */
export function ModelLoadingScreen({
  model,
  loaded,
  total,
  fetched,
  onCancel,
}: {
  readonly model: string;
  readonly loaded: number;
  readonly total: number;
  /** Bytes fetched in this load; the rest of `loaded` was kept from before. */
  readonly fetched: number;
  /** Stops the load; pieces already kept stay for next time. */
  readonly onCancel: () => void;
}) {
  const label = speechModels.find((entry) => entry.id === model)!.label;
  const percent = total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
  const warming = total > 0 && loaded >= total;
  const rate = useDownloadRate(fetched);
  const kept = loaded - fetched;
  return (
    <Card className="mx-auto w-full max-w-lg" aria-busy="true">
      <CardHeader>
        <CardTitle>Loading {label}</CardTitle>
        <CardDescription>
          {warming
            ? 'Downloaded. Getting the model ready on this device.'
            : kept > 0
              ? `Picking up where it stopped: ${megabytes(kept)} MB was already downloaded.`
              : 'Downloading model files. The page unlocks when the model is ready.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={percent} />
        <div className="flex items-center gap-3">
          <p className="flex-1 text-xs tabular-nums text-muted-foreground">
            {total > 0
              ? `${megabytes(loaded)} of ${megabytes(total)} MB`
              : 'Contacting the model host'}
            {rate !== null && !warming
              ? ` · ${(rate / 1_000_000).toFixed(1)} MB/s`
              : null}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 text-muted-foreground"
            onClick={onCancel}
          >
            Choose another model
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Terminal screen: the browser cannot run the model. */
export function UnsupportedScreen({ message }: { readonly message: string }) {
  return (
    <Card className="mx-auto w-full max-w-lg border-destructive/40">
      <CardHeader>
        <CardTitle>This browser cannot run the model</CardTitle>
        <CardDescription>
          stt needs WebGPU. Recent Chrome or Edge on a machine with a GPU works;
          Safari 26 and Firefox with WebGPU enabled also work.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
          {message}
        </pre>
      </CardContent>
    </Card>
  );
}

/** A model failed to download or start; what was kept stays for a retry. */
export function LoadFailedScreen({
  message,
  onBack,
}: {
  readonly message: string;
  readonly onBack: () => void;
}) {
  return (
    <Card className="mx-auto w-full max-w-lg border-destructive/40">
      <CardHeader>
        <CardTitle>The model did not load</CardTitle>
        <CardDescription>
          Anything already downloaded is kept, so trying again picks up from
          there.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
          {message}
        </pre>
        <Button variant="secondary" onClick={onBack}>
          Choose a model
        </Button>
      </CardContent>
    </Card>
  );
}
