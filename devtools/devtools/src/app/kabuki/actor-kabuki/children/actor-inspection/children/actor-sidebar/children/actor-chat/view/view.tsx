import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import {
  busyOf,
  failureOf,
  projectOf,
  projectsOf,
  worktreesOf,
} from '../../../../../logic/shared/index.js';
import {
  Composer,
  Header,
  ProjectChoice,
  Say,
  Turns,
} from '../../../../../view/shared/index.js';
import { threadsOf } from '../logic/shared/index.js';
import type { ChatShape } from '../logic/shared/index.js';

type BodyProps = ViewPropsOf<typeof ChatShape>;

export function Body(self: BodyProps) {
  const { model, send } = self;
  if (self._tag === 'Recall') return <div className="flex min-h-0 flex-1" />;
  if (self._tag === 'Choice')
    return (
      <ProjectChoice
        app={model.app}
        asker="Chat"
        projects={model.projects}
        problem={model.listProblem}
        onChoose={(project) => send({ _tag: 'Chose', project })}
        onRetry={() => send({ _tag: 'Relisted' })}
      />
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Turns
          turns={model.turns}
          pending={model.pending}
          run={model.run}
          failure={failureOf(model.pending, model.problem, model.run)}
          working="Working"
          empty={
            <div className="m-auto max-w-64 px-4 text-center">
              <p className="text-sm font-medium text-foreground">
                Ask about this app
              </p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                The Agent reads its code and reaches{' '}
                <span className="font-mono">{model.name}</span> through
                DevTools: it looks at its Instances and History, Sends Messages
                and runs its Fakes’ controls.
              </p>
            </div>
          }
          answer={(turn) =>
            turn.text === null ? null : <Say>{turn.text}</Say>
          }
          onStop={() => send({ _tag: 'Stopped' })}
          onRetry={() => send({ _tag: 'Retried' })}
        />
      </div>
      <Composer
        disabled={busyOf(model.pending, model.problem, model.run)}
        hint={null}
        placeholder="What did the last Message change?"
        onAsk={(question) => send({ _tag: 'Asked', question })}
      />
    </div>
  );
}
