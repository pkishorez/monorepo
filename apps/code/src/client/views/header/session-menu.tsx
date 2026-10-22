import { View } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kestack/web-platform/components/dropdown-menu';
import {
  CircleAlertIcon,
  EllipsisIcon,
  GitForkIcon,
  RefreshCwIcon,
  XIcon,
} from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Pages, type Route } from '../../../shared/pages/index.ts';

/*
 * The open session's menu in the header: write its title afresh, or fork
 * it after its latest finished turn. While one runs the button spins; a
 * refusal shows beside it until dismissed.
 */

export const SessionMenu = View.make(
  Pages.SessionActionsLive,
  ({ model, send }) => {
    const { route } = useRouter<Route>();
    const sessionId =
      route._tag === 'Project' ? route.page?.sessionId : undefined;
    if (sessionId === undefined) return null;
    return (
      <span className="flex min-w-0 items-center gap-1">
        {model.problem !== null && (
          <span
            role="alert"
            className="hidden min-w-0 items-center gap-1.5 text-xs text-destructive sm:flex"
          >
            <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="max-w-64 truncate" title={model.problem}>
              {model.problem}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              className="text-muted-foreground"
              onClick={() => send({ _tag: 'Dismiss' })}
            >
              <XIcon aria-hidden />
            </Button>
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Session actions"
                disabled={model.busy !== null}
                className="shrink-0 text-muted-foreground"
              />
            }
          >
            {model.busy === null ? <EllipsisIcon aria-hidden /> : <Spinner />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem
              onClick={() => send({ _tag: 'Retitle', sessionId })}
            >
              <RefreshCwIcon aria-hidden />
              Regenerate title
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => send({ _tag: 'Fork', sessionId })}>
              <GitForkIcon aria-hidden />
              Fork from the latest turn
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    );
  },
);
