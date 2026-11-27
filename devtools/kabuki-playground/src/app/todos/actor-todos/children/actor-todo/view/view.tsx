import { CircleAlertIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Checkbox } from '@kestack/web-platform/ui/components/checkbox';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { shownTitleOf } from '../logic/shared/index.ts';
import type { TodoShape } from '../logic/shared/index.ts';
import { Editor } from './editor.tsx';

const LINK =
  'rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring';

export function Body(self: ViewPropsOf<typeof TodoShape>) {
  const { model, state, props, send } = self;
  const title = shownTitleOf(self);
  return (
    <div className="group/todo flex items-start gap-3 px-4 py-2.5">
      <Checkbox
        checked={props.done}
        onCheckedChange={() => send({ _tag: 'Toggled' })}
        aria-label={props.done ? 'Mark not done' : 'Mark done'}
        className="mt-1"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {state._tag === 'Editing' ? (
          <Editor
            title={model.title}
            onSave={(next) => send({ _tag: 'Renamed', title: next })}
            onCancel={() => send({ _tag: 'EditingCancelled' })}
          />
        ) : (
          <p
            onDoubleClick={() => send({ _tag: 'EditingStarted' })}
            className={cn(
              'text-sm leading-6 text-pretty [overflow-wrap:anywhere] transition-colors duration-150',
              props.done &&
                'text-muted-foreground line-through decoration-muted-foreground/60',
            )}
          >
            {title}
          </p>
        )}
        {state._tag === 'Saving' && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3" />
            Saving…
          </p>
        )}
        {state._tag === 'Failed' && (
          <p
            role="alert"
            className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-destructive"
          >
            <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            <span>Couldn’t save. {state.reason}</span>
            <button
              type="button"
              onClick={() => send({ _tag: 'Retried' })}
              className={LINK}
            >
              Retry
            </button>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <button
              type="button"
              onClick={() => send({ _tag: 'EditingCancelled' })}
              className={cn(LINK, 'text-muted-foreground')}
            >
              Keep “{model.title}”
            </button>
          </p>
        )}
      </div>
      <div className="-my-1 flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-focus-within/todo:opacity-100 group-hover/todo:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Rename"
          title="Rename"
          disabled={state._tag !== 'Idle'}
          onClick={() => send({ _tag: 'EditingStarted' })}
          className="text-muted-foreground"
        >
          <PencilIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete"
          title="Delete"
          onClick={() => send({ _tag: 'Deleted' })}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}
