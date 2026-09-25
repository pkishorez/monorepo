import { Button } from 'kui-toolkit/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from 'kui-toolkit/components/ui/card';
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from 'kui-toolkit/components/ui/progress';
import {
  speechModels,
  type SpeechModelId,
} from '../../../../engine/transcript/index.ts';

/** First screen: pick which model to download and run on this machine. */
export function ModelPicker({
  onChoose,
}: {
  readonly onChoose: (model: SpeechModelId) => void;
}) {
  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>Choose a speech model</CardTitle>
        <CardDescription>
          The model downloads once, is cached by the browser, and runs on your
          graphics hardware. Nothing you say leaves this page.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {speechModels.map((model) => (
          <Button
            key={model.id}
            variant="outline"
            size="lg"
            className="h-auto justify-start gap-4 px-4 py-3 text-left"
            onClick={() => onChoose(model.id)}
          >
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="font-medium">{model.label}</span>
              <span className="text-xs text-muted-foreground text-wrap">
                {model.note}
              </span>
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {model.downloadMegabytes} MB
            </span>
          </Button>
        ))}
      </CardContent>
    </Card>
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
        <Progress value={percent}>
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
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
          Voice Anchors needs WebGPU. Recent Chrome or Edge on a machine with a
          GPU works; Safari 26 and Firefox with WebGPU enabled also work.
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
