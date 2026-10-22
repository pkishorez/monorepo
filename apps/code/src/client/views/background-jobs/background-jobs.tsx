import { createContext, use, useEffect, useRef, useState } from 'react';
import type { Project, Session } from '@kestack/ai-toolkit/api';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import {
  BotIcon,
  CircleAlertIcon,
  SquareTerminalIcon,
} from '@kestack/web-platform/components/lucide';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/components/popover';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Pages, router } from '../../../shared/pages/index.ts';
import { elapsed } from '../time/index.ts';
import { countJobs, groupJobs } from './group.ts';

export { jobsBySession } from './group.ts';

/*
 * A pill at the page's top right while any session's agent has work
 * running in the background, saying how much. It opens to the jobs, by
 * project and session, each with what it is, how long it has run, and a
 * button that stops it. With none, the pill fades away; it moves only when
 * motion is welcome.
 */

/** The projects and sessions the app knows, to name the jobs' places by. */
export const Known = createContext<{
  readonly projects: ReadonlyArray<Project>;
  readonly sessions: ReadonlyArray<Session>;
}>({ projects: [], sessions: [] });

/** The time now, again every second while `on`. */
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

const plural = (count: number) =>
  `${count} background job${count === 1 ? '' : 's'}`;

export const BackgroundJobsBubble = View.make(
  Pages.BackgroundJobsLive,
  ({ model, send }) => {
    const { projects, sessions } = use(Known);
    const count = countJobs(model.sessions);
    // The pill keeps its last count while it fades out.
    const shown = useRef(count);
    if (count > 0) shown.current = count;
    const now = useNow(model.open);
    const groups = groupJobs(model.sessions, projects, sessions);
    const hidden = count === 0;
    return (
      <div
        inert={hidden}
        className={`absolute top-3 right-4 z-20 transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none sm:right-6 ${hidden ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <Popover
          open={model.open && !hidden}
          onOpenChange={(open) => send({ _tag: 'Open', open })}
        >
          <PopoverTrigger
            render={
              <button
                type="button"
                className="focus-ring inline-flex h-8 cursor-pointer items-center gap-2 rounded-full bg-popover px-3 text-xs font-medium text-popover-foreground tabular-nums shadow-md ring-1 ring-edge transition-[background-color,scale] duration-150 ease-out hover:bg-muted active:scale-[0.96] motion-reduce:transition-none dark:shadow-black/60"
              />
            }
          >
            <span aria-hidden className="relative inline-flex size-2 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-positive opacity-40 motion-reduce:hidden" />
              <span className="relative size-2 rounded-full bg-positive" />
            </span>
            {plural(shown.current)}
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="max-h-[min(28rem,70dvh)] w-96 max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto p-0"
          >
            <header className="flex flex-col gap-0.5 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Background jobs</h2>
              <p className="text-xs text-muted-foreground">
                Work agents left running. It stops when the server does.
              </p>
            </header>
            <div className="flex flex-col gap-4 px-2 py-3">
              {groups.map((group) => (
                <section
                  key={group.projectId}
                  aria-label={group.name}
                  className="flex flex-col gap-2"
                >
                  <h3 className="px-2 text-xs font-medium text-muted-foreground">
                    {group.name}
                  </h3>
                  {group.sessions.map((each) => (
                    <div key={each.sessionId} className="flex flex-col">
                      <Router.Link
                        to={router.Project.Session({
                          projectId: group.projectId,
                          sessionId: each.sessionId,
                        })}
                        onClick={() => send({ _tag: 'Open', open: false })}
                        className="focus-ring truncate rounded-sm px-2 py-1 text-sm font-medium transition-colors duration-150 hover:text-foreground/70 motion-reduce:transition-none"
                        title={each.title}
                      >
                        {each.title}
                      </Router.Link>
                      <ul className="flex flex-col">
                        {each.jobs.map((job) => {
                          const stopping = model.stopping.includes(job.id);
                          const Icon =
                            job.kind === 'shell' ? SquareTerminalIcon : BotIcon;
                          return (
                            <li
                              key={job.id}
                              className="flex min-h-9 items-center gap-2.5 rounded-md px-2 hover:bg-muted/60"
                            >
                              <Icon
                                role="img"
                                aria-label={
                                  job.kind === 'shell' ? 'Shell' : 'Subagent'
                                }
                                className="size-3.5 shrink-0 text-muted-foreground"
                              />
                              <span
                                title={job.title}
                                className={`min-w-0 flex-1 truncate ${job.kind === 'shell' ? 'font-mono text-xs' : 'text-sm'}`}
                              >
                                {job.title}
                              </span>
                              {job.startedAt !== undefined && (
                                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                  {elapsed(now - job.startedAt)}
                                </span>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={stopping}
                                aria-label={`Stop ${job.title}`}
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  send({
                                    _tag: 'Stop',
                                    sessionId: each.sessionId,
                                    jobId: job.id,
                                  })
                                }
                              >
                                {stopping && <Spinner />}
                                Stop
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>
            {model.problem !== null && (
              <p
                role="alert"
                className="flex items-start gap-2 border-t border-border px-4 py-3 text-sm text-destructive"
              >
                <CircleAlertIcon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0"
                />
                {model.problem}
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);
