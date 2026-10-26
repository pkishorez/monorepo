import { View } from '@kestack/kabuki/react';
import { Badge } from '@kestack/web-platform/ui/components/badge';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
} from '@kestack/web-platform/ui/components/collapsible';
import { ChevronRightIcon, LockIcon, Trash2Icon } from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import * as Confirm from '../../../../../../../../../ui/controls/notice/index.ts';
import {
  Path,
  tilde,
} from '../../../../../../../../../ui/labels/path/index.ts';
import { ago } from '../../../../../../../../../ui/labels/status/index.ts';
import { useLock } from '../../../../../../connection/link/index.ts';
import { ConnectionProjectsLive, type Row } from './actor.ts';

/*
 * One Connection's Projects, a row each as its agents' accounts are: its
 * name and whether its folder is there, Active or Folder missing, over
 * its path, cut in the middle so its end shows, and when it was last
 * active. Tapping a row opens it under its row, on touch as with keys:
 * its whole path, and Remove, which asks first. While the Connection's Link
 * is not linked, Remove takes no tap. Until what this device holds is
 * read, only the room the list takes, so it draws in one step.
 */

function Summary({ row }: { readonly row: Row }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium">{row.name}</span>
        {row.missing ? (
          <Badge variant="destructive">Folder missing</Badge>
        ) : (
          <Badge variant="secondary">Active</Badge>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <Path value={tilde(row.path)} />
        <span className="shrink-0">· {ago(row.activeAt)}</span>
      </span>
    </span>
  );
}

export const ConnectionProjectsView = View.make(
  ConnectionProjectsLive,
  ({ root, model, send }) => {
    const { locked, said } = useLock(model.connectionId);
    const open = Confirm.useOpen();
    const panelOf = (id: string) => `project-${model.connectionId}-${id}-panel`;
    const asked = model.rows?.find(({ id }) => id === model.asking);
    return (
      <div {...root} className="flex flex-col gap-1">
        {model.rows === null ? (
          // Read from this device in a moment: its room, and nothing in it.
          <div className="h-20" aria-busy />
        ) : model.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No projects yet. Open a folder from the sidebar's + to add one.
          </p>
        ) : (
          <ul className="flex flex-col">
            {model.rows.map((row) => {
              const expanded = model.open === row.id;
              return (
                <li key={row.id} className="flex flex-col">
                  <button
                    type="button"
                    aria-label={row.name}
                    aria-expanded={expanded}
                    aria-controls={panelOf(row.id)}
                    className="focus-ring -mx-2 flex min-h-12 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-muted active:bg-muted"
                    onClick={() => send({ _tag: 'Toggled', id: row.id })}
                  >
                    <Summary row={row} />
                    <ChevronRightIcon
                      aria-hidden
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
                        expanded && 'rotate-90',
                      )}
                    />
                  </button>
                  <Collapsible open={expanded}>
                    <CollapsibleContent
                      id={panelOf(row.id)}
                      className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:h-0 data-ending-style:duration-150 data-starting-style:h-0 motion-reduce:transition-none"
                    >
                      <div className="flex flex-col items-start gap-3 pt-2 pb-5">
                        <p className="font-mono text-xs [overflow-wrap:anywhere] text-muted-foreground">
                          {row.path}
                        </p>
                        {row.missing && (
                          <p className="text-sm text-muted-foreground">
                            Its folder no longer exists on this Connection. Its
                            sessions stay readable; no new one can start.
                          </p>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={locked}
                          className="h-11 text-destructive keyboard:h-8"
                          onClick={() =>
                            open(() => send({ _tag: 'Ask', id: row.id }))
                          }
                        >
                          {said ? (
                            <LockIcon aria-hidden />
                          ) : (
                            <Trash2Icon aria-hidden />
                          )}
                          Remove project…
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </li>
              );
            })}
          </ul>
        )}
        <Confirm.Dialog
          open={asked !== undefined}
          title={`Remove ${asked?.name ?? 'this project'}?`}
          description={
            asked?.missing === true
              ? 'Its sessions leave this app.'
              : 'Its sessions leave this app. The folder and its files stay exactly as they are.'
          }
          problem={model.problem}
          busy={model.removing}
          keep="Keep it"
          confirm="Remove project"
          onClose={() => send({ _tag: 'Keep' })}
          onConfirm={() => send({ _tag: 'Remove' })}
        />
      </div>
    );
  },
);
