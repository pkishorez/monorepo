import { RotateCcwIcon } from 'lucide-react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  busyOf,
  failureOf,
  projectOf,
  projectsOf,
  worktreesOf,
} from '../../../logic/shared/index.js';
import { missedOf, stageOf, threadsOf } from '../logic/shared/index.js';
import type { StoryShape } from '../logic/shared/index.js';
import { Canvas } from './canvas.js';
import {
  Composer,
  Header,
  ProjectChoice,
  Turns,
} from '../../../view/shared/index.js';
import { Answered } from './answered.js';
import { Playback } from './playback.js';

type BodyProps = ViewPropsOf<typeof StoryShape>;

function Waiting({ children }: { readonly children: string }) {
  return (
    <p
      role="status"
      className="m-auto flex items-center gap-2 text-sm text-muted-foreground"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 motion-reduce:animate-none" />
      {children}
    </p>
  );
}

export function Body(self: BodyProps) {
  const { root, model, props, send } = self;
  if (self._tag === 'Recall')
    return <div {...root} className="flex min-h-0 flex-1" />;
  if (self._tag === 'Choice')
    return (
      <div {...root} className="flex min-h-0 flex-1">
        <ProjectChoice
          app={model.app}
          asker="Story"
          projects={model.projects}
          problem={model.listProblem}
          onChoose={(project) => send({ _tag: 'Chose', project })}
          onRetry={() => send({ _tag: 'Relisted' })}
        />
      </div>
    );

  const stage = stageOf(self);
  const busy = busyOf(model.pending, model.problem, model.run);
  const onAsk = (chip: string) => send({ _tag: 'Chipped', chip });

  return (
    <div {...root} className="flex min-h-0 flex-1 flex-col md:flex-row">
      <section
        aria-label="Blueprint"
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {model.plan !== null ? (
          <Canvas
            plan={model.plan}
            live={new Set(model.live)}
            stage={stage}
            onExplore={() => send({ _tag: 'Explored' })}
            onToggle={(actor, ref) => send({ _tag: 'Toggled', actor, ref })}
            onFold={(actor, state) => send({ _tag: 'Folded', actor, state })}
            onAsk={onAsk}
          >
            <Playback
              focus={stage.focus}
              mode={stage.mode}
              playing={model.playing}
              shown={props?.shown !== false}
              onStep={(by) => send({ _tag: 'Stepped', by })}
              onPlay={(playing) => send({ _tag: 'Played', playing })}
              onReturn={() => send({ _tag: 'Returned' })}
            />
          </Canvas>
        ) : model.planProblem !== null ? (
          <div className="m-auto flex max-w-sm flex-col items-start gap-2 px-6">
            <p className="text-sm text-pretty text-muted-foreground">
              {model.planProblem}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => send({ _tag: 'Replanned' })}
            >
              <RotateCcwIcon aria-hidden className="size-3.5" />
              Try again
            </Button>
          </div>
        ) : (
          <Waiting>Reading the app's Blueprint…</Waiting>
        )}
      </section>
      <aside
        aria-label="Story"
        className="flex h-[45%] shrink-0 flex-col border-t border-border/50 md:h-auto md:w-[22rem] md:border-t-0 md:border-l"
      >
        <Header
          projects={projectsOf(self.state.project, model.projects)}
          project={projectOf(self.state.project, model.projects)}
          worktrees={worktreesOf(self.state.folder, model.worktrees)}
          folder={self.state.folder}
          worktreesProblem={model.worktreesProblem}
          threads={threadsOf(self)}
          thread={model.thread}
          onProject={(project) => send({ _tag: 'Chose', project })}
          onWorktree={(folder) => send({ _tag: 'Switched', folder })}
          onRetryWorktrees={() => send({ _tag: 'WorktreesRelisted' })}
          onThread={(thread) => send({ _tag: 'Opened', thread })}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Turns
            turns={model.turns}
            pending={model.pending}
            run={model.run}
            failure={failureOf(model.pending, model.problem, model.run)}
            working="Reading the code"
            empty={
              <div className="m-auto max-w-64 px-4 text-center">
                <p className="text-sm font-medium text-foreground">
                  Ask how it works
                </p>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">
                  The Agent reads this folder's code and answers as a story you
                  play on the Blueprint, one Beat at a time.
                </p>
              </div>
            }
            answer={(turn, index) => (
              <Answered
                turn={turn}
                index={index}
                at={model.at}
                missing={missedOf(self)}
                onJump={(at, beat) => send({ _tag: 'Jumped', turn: at, beat })}
              />
            )}
            onStop={() => send({ _tag: 'Stopped' })}
            onRetry={() => send({ _tag: 'Retried' })}
          />
        </div>
        <Composer
          chips={model.chips}
          disabled={busy || model.plan === null}
          hint={
            model.plan === null && model.planProblem === null
              ? "Waiting for the app's Blueprint…"
              : null
          }
          onAsk={(question) => send({ _tag: 'Asked', question })}
          placeholder="How does a to-do get saved?"
          onUnchip={(chip) => send({ _tag: 'Unchipped', chip })}
        />
      </aside>
    </div>
  );
}
