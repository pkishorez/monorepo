import { useEffect, useState, type ReactNode } from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useAnimate,
} from 'motion/react';
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
import { Hero, Waveform } from './hero.tsx';

/** Every screen swap slides and fades the same way. */
function Screen({ children }: { readonly children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** The page: gate on WebGPU and a loaded model, then the recording studio. */
export function Workspace() {
  const [model, setModel] = useState<SpeechModelId | null>(null);
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
  return (
    <AnimatePresence mode="wait">
      {loading.status === 'loading' ? (
        <Screen key="loading">
          <ModelLoadingScreen
            model={model}
            loaded={loading.loaded}
            total={loading.total}
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
  const [presses, setPresses] = useState<Readonly<Record<string, number>>>({});
  const press = (button: (typeof contextButtons)[number]) => {
    session.inject(button.payload);
    setPresses((counts) => ({
      ...counts,
      [button.key]: (counts[button.key] ?? 0) + 1,
    }));
  };

  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      const button = contextButtons.find((entry) => entry.key === event.key);
      if (button && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        press(button);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, session]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <motion.span
          className="relative inline-flex"
          whileTap={{ scale: 0.96 }}
        >
          {recording ? <RecordingRings /> : null}
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
        </motion.span>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Context buttons"
        >
          {contextButtons.map((button) => (
            <PressPulse key={button.key} count={presses[button.key] ?? 0}>
              <Button
                variant="secondary"
                disabled={!recording}
                onClick={() => press(button)}
              >
                <Kbd className="pointer-coarse:hidden">{button.key}</Kbd>
                {button.payload.label}
              </Button>
            </PressPulse>
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
      <AnimatePresence initial={false}>
        {recording ? (
          <motion.div
            key="meter"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            <Waveform active bars={56} className="h-10" />
          </motion.div>
        ) : null}
      </AnimatePresence>
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

/** A soft ring spreading from the stop button while the microphone is live. */
function RecordingRings() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 animate-ping rounded-md bg-destructive/30 [animation-duration:1.6s]"
    />
  );
}

/** A quick bump and ring on every press, from a click or a key. */
function PressPulse({
  count,
  children,
}: {
  readonly count: number;
  readonly children: ReactNode;
}) {
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  useEffect(() => {
    if (count > 0) {
      void animate(
        scope.current,
        { scale: [0.94, 1] },
        { type: 'spring', duration: 0.35, bounce: 0.5 },
      );
    }
  }, [count, animate, scope]);
  return (
    <motion.span
      ref={scope}
      className="relative inline-flex"
      whileTap={{ scale: 0.96 }}
    >
      {count > 0 ? (
        <motion.span
          key={count}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary"
          initial={{ opacity: 0.9, scale: 1 }}
          animate={{ opacity: 0, scale: 1.25 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        />
      ) : null}
      {children}
    </motion.span>
  );
}
