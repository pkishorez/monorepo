import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Kbd } from 'kui-toolkit/components/ui/kbd';
import { Mic, RotateCcw, Square } from 'kui-toolkit/lucide';
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
import { Hero } from './hero.tsx';

/** Screens swap with a short crossfade and nothing else. */
function Screen({ children }: { readonly children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/** The page: gate on WebGPU and a loaded model, then the recording studio. */
export function Workspace() {
  const [model, setModel] = useState<string | null>(null);
  const [webGpu, setWebGpu] = useState<'checking' | 'yes' | 'no'>('checking');
  useEffect(() => {
    setWebGpu('gpu' in navigator ? 'yes' : 'no');
  }, []);

  const screen =
    webGpu === 'no'
      ? 'unsupported'
      : webGpu === 'yes'
        ? model === null
          ? 'picker'
          : 'studio'
        : null;

  return (
    <MotionConfig reducedMotion="user">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <Hero compact={screen === 'studio'} />
        <AnimatePresence mode="wait">
          {screen === 'unsupported' ? (
            <Screen key="unsupported">
              <UnsupportedScreen message="navigator.gpu is not defined" />
            </Screen>
          ) : screen === 'picker' ? (
            <Screen key="picker">
              <ModelPicker onChoose={setModel} />
            </Screen>
          ) : screen === 'studio' && model !== null ? (
            <Screen key="studio">
              <Studio model={model} onChangeModel={() => setModel(null)} />
            </Screen>
          ) : null}
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}

function Studio({
  model,
  onChangeModel,
}: {
  readonly model: string;
  readonly onChangeModel: () => void;
}) {
  const runtime = useStudioRuntime();
  if (runtime === null) {
    return (
      <ModelLoadingScreen model={model} loaded={0} total={0} fetched={0} />
    );
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
  readonly model: string;
  readonly onChangeModel: () => void;
}) {
  const loading = useModelLoading(runtime, model);
  const session = useStudioSession(runtime);

  if (loading.status === 'error') {
    return <UnsupportedScreen message={loading.message} />;
  }
  return (
    <AnimatePresence mode="wait">
      {loading.status === 'loading' ? (
        <Screen key="loading">
          <ModelLoadingScreen
            model={model}
            loaded={loading.loaded}
            total={loading.total}
            fetched={loading.fetched}
          />
        </Screen>
      ) : (
        <Screen key="recorder">
          <Recorder session={session} onChangeModel={onChangeModel} />
        </Screen>
      )}
    </AnimatePresence>
  );
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
            className="min-w-36"
            variant="destructive"
            onClick={session.stop}
            disabled={finishing}
          >
            <Square />
            {finishing ? 'Finishing' : 'Stop'}
          </Button>
        ) : (
          <Button
            size="lg"
            className="min-w-36"
            onClick={done ? session.reset : session.start}
          >
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
