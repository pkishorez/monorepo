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
  speechModels,
  type SpeechModelId,
} from '../../../../engine/transcript/index.ts';
import {
  clearModelCache,
  readModelCaches,
  type ModelCache,
} from './downloaded-models.ts';

/** First screen on every visit: nothing downloads until a model is picked. */
export function ModelPicker({
  onChoose,
}: {
  readonly onChoose: (model: SpeechModelId) => void;
}) {
  const [caches, setCaches] = useState<ReadonlyMap<SpeechModelId, ModelCache>>(
    () => new Map(),
  );
  useEffect(() => {
    void readModelCaches().then(setCaches);
  }, []);

  return (
    <section className="mx-auto w-full max-w-md space-y-3">
      <h2 className="text-sm font-medium">Choose a model</h2>
      <ul className="divide-y rounded-lg border bg-card">
        {speechModels.map((model) => {
          const cached = caches.get(model.id) ?? 'none';
          return (
            <li key={model.id} className="flex items-center">
              <button
                type="button"
                className="flex flex-1 items-center gap-4 py-3 pr-2 pl-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
                onClick={() => onChoose(model.id)}
              >
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{model.label}</span>
                  <span className="text-xs text-muted-foreground text-pretty">
                    {model.note}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {cached === 'downloaded'
                    ? 'Downloaded'
                    : cached === 'partial'
                      ? 'Partly downloaded'
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
                    void clearModelCache(model.id)
                      .then(readModelCaches)
                      .then(setCaches);
                  }}
                >
                  Clear
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground text-pretty">
        Runs on this device. Each model downloads once, and nothing you say
        leaves the page. Clear a model to download it again.
      </p>
    </section>
  );
}

const megabytes = (bytes: number): string => (bytes / 1_048_576).toFixed(0);

/** Locked screen while the model downloads and warms up. */
export function ModelLoadingScreen({
  model,
  loaded,
  total,
}: {
  readonly model: SpeechModelId;
  readonly loaded: number;
  readonly total: number;
}) {
  const label = speechModels.find((entry) => entry.id === model)!.label;
  const percent = total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
  const warming = total > 0 && loaded >= total;
  return (
    <Card className="mx-auto w-full max-w-lg" aria-busy="true">
      <CardHeader>
        <CardTitle>Loading {label}</CardTitle>
        <CardDescription>
          {warming
            ? 'Downloaded. Compiling shaders for your GPU.'
            : 'Downloading model files. The page unlocks when the model is ready.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={percent} />
        <p className="text-xs tabular-nums text-muted-foreground">
          {total > 0
            ? `${megabytes(loaded)} of ${megabytes(total)} MB`
            : 'Contacting the model host'}
        </p>
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
