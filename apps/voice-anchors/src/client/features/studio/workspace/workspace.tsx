import { useEffect, useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Kbd } from 'kui-toolkit/components/ui/kbd';
import { Mic, RotateCcw, Square } from 'kui-toolkit/lucide';
import type { SpeechModelId } from '../../../../engine/transcript/index.ts';
import { contextButtons } from '../context-buttons/index.ts';
import { DebugPanel } from '../debug-panel/index.ts';
import {
  useModelLoading,
  useStudioRuntime,
  useStudioSession,
  type StudioRuntime,
  type StudioSessionView,
} from '../engine-runtime/index.ts';
import {
  ModelLoadingScreen,
  ModelPicker,
  UnsupportedScreen,
} from '../model-gate/index.ts';
import { TranscriptView } from '../transcript-view/index.ts';

/** The page: gate on WebGPU and a loaded model, then the recording studio. */
export function Workspace() {
  const [model, setModel] = useState<SpeechModelId | null>(null);
  const [webGpu, setWebGpu] = useState<'checking' | 'yes' | 'no'>('checking');
  useEffect(() => {
    setWebGpu('gpu' in navigator ? 'yes' : 'no');
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Voice Anchors</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">
          Speak, and press a context button in the middle of a sentence. The
          button&apos;s content lands where you said it, even though the words
          arrive a moment later. Everything runs in this tab on WebGPU.
        </p>
      </header>
      {webGpu === 'no' ? (
        <UnsupportedScreen message="navigator.gpu is not defined" />
      ) : webGpu === 'yes' && model === null ? (
        <ModelPicker onChoose={setModel} />
      ) : webGpu === 'yes' && model !== null ? (
        <Studio model={model} onChangeModel={() => setModel(null)} />
      ) : null}
    </main>
  );
}

function Studio({
  model,
  onChangeModel,
}: {
  readonly model: SpeechModelId;
  readonly onChangeModel: () => void;
}) {
  const runtime = useStudioRuntime();
  if (runtime === null) {
    return <ModelLoadingScreen model={model} loaded={0} total={0} />;
  }
  return (
    <LoadedStudio
      runtime={runtime}
      model={model}
      onChangeModel={onChangeModel}
    />
  );
}

function LoadedStudio({
  runtime,
  model,
  onChangeModel,
}: {
  readonly runtime: StudioRuntime;
  readonly model: SpeechModelId;
  readonly onChangeModel: () => void;
}) {
  const loading = useModelLoading(runtime, model);
  const session = useStudioSession(runtime);

  if (loading.status === 'error') {
    return <UnsupportedScreen message={loading.message} />;
  }
  if (loading.status === 'loading') {
    return (
      <ModelLoadingScreen
        model={model}
        loaded={loading.loaded}
        total={loading.total}
      />
    );
  }
  return <Recorder session={session} onChangeModel={onChangeModel} />;
}

function Recorder({
  session,
  onChangeModel,
}: {
  readonly session: StudioSessionView;
  readonly onChangeModel: () => void;
}) {
  const recording = session.status === 'recording';
  const finishing = session.status === 'finishing';
  const done = session.status === 'done' || typeof session.status === 'object';
  const failure =
    typeof session.status === 'object' ? session.status.failed.message : null;
  const problem = session.error ?? failure;

  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      const button = contextButtons.find((entry) => entry.key === event.key);
      if (button && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        session.inject(button.payload);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, session]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {recording || finishing ? (
          <Button
            size="lg"
            variant="destructive"
            onClick={session.stop}
            disabled={finishing}
          >
            <Square />
            {finishing ? 'Finishing' : 'Stop'}
          </Button>
        ) : (
          <Button size="lg" onClick={done ? session.reset : session.start}>
            {done ? <RotateCcw /> : <Mic />}
            {done ? 'New session' : 'Transcribe'}
          </Button>
        )}
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Context buttons"
        >
          {contextButtons.map((button) => (
            <Button
              key={button.key}
              variant="secondary"
              disabled={!recording}
              onClick={() => session.inject(button.payload)}
            >
              <Kbd className="pointer-coarse:hidden">{button.key}</Kbd>
              {button.payload.label}
            </Button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          disabled={recording || finishing}
          onClick={onChangeModel}
        >
          Change model
        </Button>
      </div>
      {problem ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {problem}
        </p>
      ) : null}
      <TranscriptView transcript={session.transcript} listening={recording} />
      <DebugPanel transcript={session.transcript} passes={session.passes} />
    </div>
  );
}
