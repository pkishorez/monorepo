import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@kstackz/ui-toolkit/components/ui/sheet';
import { ArrowUpIcon } from '@kstackz/ui-toolkit/lucide';

const FIELD =
  'w-full bg-transparent py-3 text-base outline-none placeholder:text-muted-foreground';

/** A new mail, in a sheet from the bottom. Sending files it under Sent. */
export function Compose(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSend: (to: string, subject: string, body: string) => void;
}) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-[92dvh] gap-0 rounded-t-2xl"
      >
        <form
          className="flex h-full flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            props.onSend(
              String(data.get('to') ?? '').trim(),
              String(data.get('subject') ?? '').trim(),
              String(data.get('body') ?? '').trim(),
            );
            props.onOpenChange(false);
          }}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 px-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11 text-[15px] md:h-9"
              onClick={() => props.onOpenChange(false)}
            >
              Cancel
            </Button>
            <SheetTitle className="flex-1 text-center text-[15px] font-semibold">
              New message
            </SheetTitle>
            <Button
              type="submit"
              size="icon"
              aria-label="Send"
              className="size-11 rounded-full md:size-9"
            >
              <ArrowUpIcon aria-hidden="true" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col divide-y divide-border px-4">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">To</span>
              <input
                name="to"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className={FIELD}
              />
            </label>
            <input name="subject" placeholder="Subject" className={FIELD} />
            <textarea name="body" className={`${FIELD} flex-1 resize-none`} />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
