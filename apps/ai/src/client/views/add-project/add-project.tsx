import { View, type ViewProps } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import {
  CircleAlertIcon,
  FolderPlusIcon,
  PlusIcon,
} from '@kestack/web-platform/components/lucide';
import { Input } from '@kestack/web-platform/components/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/components/popover';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Pages } from '../../../shared/pages/index.ts';

/*
 * The path of a folder, typed or pasted, and the button that adds it. A
 * problem shows under the field, the server's own when it has no such
 * folder.
 */

type Self = ViewProps<typeof Pages.AddProjectLive>;

function Form({
  model,
  send,
  id,
  focus,
  hideLabel,
}: Pick<Self, 'model' | 'send'> & {
  readonly id: string;
  readonly focus?: boolean;
  readonly hideLabel?: boolean;
}) {
  return (
    <form
      className="flex w-full flex-col gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        send({ _tag: 'Submit' });
      }}
    >
      <label
        htmlFor={id}
        className={hideLabel ? 'sr-only' : 'text-sm font-medium'}
      >
        Folder path
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          autoFocus={focus}
          autoComplete="off"
          spellCheck={false}
          placeholder="/Users/you/code/project"
          value={model.path}
          aria-invalid={model.problem !== null}
          aria-describedby={model.problem ? `${id}-problem` : undefined}
          onChange={(event) =>
            send({ _tag: 'Typed', path: event.currentTarget.value })
          }
          className="min-w-0 flex-1 font-mono text-base md:text-[13px]"
        />
        <Button type="submit" disabled={model.adding} className="shrink-0">
          {model.adding ? <Spinner /> : <FolderPlusIcon aria-hidden />}
          Add
        </Button>
      </div>
      {model.problem !== null && (
        <p
          id={`${id}-problem`}
          role="alert"
          className="flex items-center gap-1.5 text-sm text-destructive"
        >
          <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
          {model.problem}
        </p>
      )}
    </form>
  );
}

/** The form on its own, as the home page shows it while there are no projects. */
export const AddProjectForm = View.make(
  Pages.AddProjectLive,
  ({ root, model, send }) => (
    <div {...root}>
      <Form model={model} send={send} id="add-project-path" focus />
    </div>
  ),
);

/** The form under a heading of its own, which names it, so without its label. */
export const AddProjectField = View.make(
  Pages.AddProjectLive,
  ({ root, model, send }) => (
    <div {...root}>
      <Form model={model} send={send} id="add-project-field" hideLabel />
    </div>
  ),
);

/** A plus that opens the form in a popover, as the sidebar shows it. */
export const AddProjectPopover = View.make(
  Pages.AddProjectLive,
  ({ model, send }) => (
    <Popover
      open={model.open}
      onOpenChange={(open) => send({ _tag: 'Open', open })}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Add a folder"
            className="text-muted-foreground"
          />
        }
      >
        <PlusIcon />
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-96">
        <Form model={model} send={send} id="add-project-popover-path" focus />
      </PopoverContent>
    </Popover>
  ),
);
