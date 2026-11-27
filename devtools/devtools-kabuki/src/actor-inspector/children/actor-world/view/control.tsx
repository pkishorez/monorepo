import { useState } from 'react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import { draftOf, valueOf } from '../../../logic/shared/index.ts';
import type { Draft, Problem } from '../../../logic/shared/index.ts';
import { Fields } from '../../../view/shared/index.ts';
import type { Control } from '../logic/shared/index.ts';

const BUTTON = 'h-7 rounded-md px-2.5 text-xs touch:h-11';

export function ControlButton({
  control,
  onRun,
}: {
  readonly control: Control;
  readonly onRun: (payload: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(control.input));
  const [problems, setProblems] = useState<ReadonlyArray<Problem>>([]);
  if (control.bare)
    return (
      <Button
        type="button"
        variant="outline"
        title={control.description}
        onClick={() => onRun({})}
        className={BUTTON}
      >
        {control.label}
      </Button>
    );
  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-haspopup="dialog"
        title={control.description}
        onClick={() => setOpen(true)}
        className={BUTTON}
      >
        {control.label}…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const built = valueOf(control.input, draft);
              if (built._tag === 'Unbuilt') return setProblems(built.problems);
              setProblems([]);
              onRun(built.value);
              setOpen(false);
            }}
            className="flex flex-col gap-5"
          >
            <DialogHeader>
              <DialogTitle>{control.label}</DialogTitle>
              <DialogDescription className="text-pretty">
                {control.description ??
                  'Runs this control on its Fake. What it changes shows in the Fake’s state.'}
              </DialogDescription>
            </DialogHeader>
            <Fields
              input={control.input}
              draft={draft}
              problems={problems}
              onDraft={setDraft}
            />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="ghost" />}>
                Cancel
              </DialogClose>
              <Button type="submit">{control.label}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
