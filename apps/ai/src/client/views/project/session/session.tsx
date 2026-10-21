import { useMemo } from 'react';
import type { Message, Session } from '@kestack/ai-toolkit/api';
import { useChild, View } from '@kestack/kabuki/react';
import { TriangleAlertIcon } from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Pages } from '../../../../shared/pages/index.ts';
import { RunningDot } from '../../running-dot/index.ts';
import { useOffline, useSettled } from '../../settled/index.ts';
import { Composer } from './composer.tsx';
import { useFollow } from './follow.ts';
import { Rows, thread } from './transcript/index.ts';

/*
 * A session: the transcript in a centred column that follows new messages
 * while you are at its bottom, and the composer pinned under it. Its title,
 * agent and model are in the header. Its words can be selected, though the
 * App Shell turns selection off for its swipes. While the server is out of
 * reach, nothing can be sent, and a running turn's progress is unknown. A
 * session the server stopped mid-turn says so under its transcript.
 */

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
    const offline = useOffline();
    const opening = {
      isOpen: (id: string) => model.open.includes(id),
      toggle: (id: string) => send({ _tag: 'Toggle', id }),
    };
    const missing =
      settled && found?.status === 'ready' && session === undefined;
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          className="min-h-0 flex-1 overflow-y-auto select-text [overflow-anchor:none]"
        >
          <div
            ref={content}
            className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-8 pb-10 sm:px-6"
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
            {session?.status === 'interrupted' &&
              messages?.status === 'ready' && (
                <p
                  role="status"
                  className="flex items-center gap-2 pt-1 text-xs text-muted-foreground"
                >
                  <TriangleAlertIcon
                    aria-hidden
                    className="size-3.5 shrink-0 text-warning"
                  />
                  The server stopped mid-turn, so some work may be half done.
                  Send a message to carry on; the agent remembers the
                  conversation.
                </p>
              )}
            {running && messages?.status === 'ready' && (
              <p
                role="status"
                className="flex items-center gap-2 pt-1 text-xs text-muted-foreground"
              >
                {offline === null ? (
                  <>
                    <RunningDot /> Working…
                  </>
                ) : (
                  'Last seen working. Updates resume when the server is back.'
                )}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 pt-2 pb-4 sm:pb-5">
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            <Composer
              draft={model.draft}
              running={running}
              stopping={model.stopping}
              problem={model.problem}
              offline={offline}
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
