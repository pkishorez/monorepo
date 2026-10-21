import { useMemo } from 'react';
import type { Message, Session } from '@kestack/ai-toolkit/api';
import { useChild, View } from '@kestack/kabuki/react';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Pages } from '../../../../shared/pages/index.ts';
import { PageBar } from '../../page-bar/index.ts';
import { RunningDot } from '../../running-dot/index.ts';
import { useSettled } from '../../settled/index.ts';
import { Composer } from './composer.tsx';
import { useFollow } from './follow.ts';
import { Rows, thread } from './transcript/index.ts';

/*
 * A session: its title, agent and model at the top, the transcript in a
 * centred column that follows new messages while you are at its bottom,
 * and the composer pinned under it.
 */

const AGENT = { claude: 'Claude', codex: 'Codex' } as const;

export const SessionView = View.make(
  Pages.SessionLive,
  ({ root, model, children, send }) => {
    const found = useChild(children.session, ({ model }) => model);
    const messages = useChild(children.messages, ({ model }) => model);
    const session = found?.rows[0]?.row as Session | undefined;
    const running = session?.status === 'running';
    const rows = useMemo(
      () => thread((messages?.rows ?? []).map(({ row }) => row as Message)),
      [messages?.rows],
    );
    const { scroller, content } = useFollow();
    const settled = useSettled();
    const opening = {
      isOpen: (id: string) => model.open.includes(id),
      toggle: (id: string) => send({ _tag: 'Toggle', id }),
    };
    const missing =
      settled && found?.status === 'ready' && session === undefined;
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <PageBar
          title={
            missing ? (
              'Session not found'
            ) : session ? (
              <span className="flex items-center gap-2">
                <span className="truncate">
                  {session.title || 'Untitled session'}
                </span>
                {running && <RunningDot />}
              </span>
            ) : (
              <Skeleton className="h-4 w-40" />
            )
          }
          detail={session && `${AGENT[session.harness]} · ${session.model}`}
        />
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
        >
          <div
            ref={content}
            className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-6 pt-8 pb-10"
          >
            {missing ? (
              <p className="text-sm text-muted-foreground">
                It may belong to a project that was removed.
              </p>
            ) : messages?.status !== 'ready' || session === undefined ? (
              <div className="flex flex-col gap-3" aria-busy>
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <Rows rows={rows} opening={opening} running={running} />
            )}
            {running && messages?.status === 'ready' && (
              <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <RunningDot /> Working…
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 pb-5">
          <div className="mx-auto w-full max-w-[720px] px-6">
            <Composer
              draft={model.draft}
              running={running}
              stopping={model.stopping}
              problem={model.problem}
              onType={(text) => send({ _tag: 'Typed', text })}
              onSend={() => send({ _tag: 'Send' })}
              onStop={() => send({ _tag: 'Stop' })}
            />
          </div>
        </div>
      </div>
    );
  },
);
