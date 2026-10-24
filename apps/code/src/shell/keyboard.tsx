import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import { useIsMobile } from '@kestack/web-platform/ui/components/hooks/use-mobile';
import { BindingKeys } from '@kestack/web-platform/ui/input';
import type { ReactNode } from 'react';
import { keys, keyTable } from '../keys.ts';

/*
 * The app's keyboard, from `keys.ts`, with Vim Mode and the user's own
 * Bindings from Device State, which the root page read before drawing
 * this. Vim Mode is off until turned on, by Mod+Alt+V from anywhere or in
 * Settings, which asks the root page to keep it. On a phone, where the
 * sidebar is the whole screen, it is off whatever is kept, and cannot be
 * turned on; the kept choice holds again once the screen is wide. The keys sheet is drawn
 * while its Surface is Active, opened by `?` in Vim Mode or Ctrl+/ in
 * either: the key table as Settings lists it, the keys as bound now, the
 * Vim Mode ones quieter while it is off.
 */

export function Keyboard({
  vim,
  bindings,
  onVimChange,
  children,
}: {
  readonly vim: boolean;
  readonly bindings: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly onVimChange: (on: boolean) => void;
  readonly children: ReactNode;
}) {
  const phone = useIsMobile();
  return (
    <keys.Provider
      vim={vim && !phone}
      onVimChange={(on) => {
        if (!phone) onVimChange(on);
      }}
      bindings={bindings}
    >
      <VimSwitch />
      {children}
      <KeysSheet />
    </keys.Provider>
  );
}

function VimSwitch() {
  const { vim } = keys.useKeyboard();
  keys.useAction('app.vim', vim.toggle);
  return null;
}

type Id = (typeof keyTable)[number]['rows'][number]['always'][number];

function KeysSheet() {
  const { active } = keys.useSurface('help');
  const { leave, vim } = keys.useKeyboard();
  return (
    <Dialog
      open={active}
      onOpenChange={(open, details) => {
        // Escape is the keyboard's: it leaves the Surface, which closes this.
        if (details.reason === 'escape-key') {
          details.cancel();
          details.allowPropagation();
        } else if (!open) leave('help');
      }}
    >
      <keys.Surface id="help" asChild>
        <DialogContent
          finalFocus={false}
          className="max-h-[80dvh] gap-4 overflow-y-auto sm:max-w-xl"
        >
          <DialogHeader>
            <DialogTitle>Keys</DialogTitle>
          </DialogHeader>
          <div
            aria-hidden
            className="grid grid-cols-[minmax(0,1fr)_9rem_9rem] gap-3 border-b border-border pb-1.5 text-xs font-medium text-muted-foreground"
          >
            <span>Action</span>
            <span>Always</span>
            <span>Vim Mode{vim.on ? '' : ', off'}</span>
          </div>
          {keyTable.map((section) => (
            <section key={section.title} className="grid gap-1">
              <h3 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {section.title}
              </h3>
              {section.rows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[minmax(0,1fr)_9rem_9rem] items-center gap-3 py-0.5 text-sm"
                >
                  <span>{row.label}</span>
                  <Bound ids={row.always} />
                  <Bound ids={row.vim} quiet={!vim.on} />
                </div>
              ))}
            </section>
          ))}
        </DialogContent>
      </keys.Surface>
    </Dialog>
  );
}

/** The keys of some Actions as bound now; a dash for none. */
function Bound({
  ids,
  quiet = false,
}: {
  readonly ids: ReadonlyArray<Id>;
  readonly quiet?: boolean;
}) {
  if (ids.length === 0)
    return <span className="text-muted-foreground/60">–</span>;
  return (
    <span className={`flex flex-wrap gap-1 ${quiet ? 'opacity-50' : ''}`}>
      {ids.map((id) => (
        <First key={id} id={id} />
      ))}
    </span>
  );
}

function First({ id }: { readonly id: Id }) {
  const [first] = keys.useKeysOf(id);
  return first === undefined ? null : <BindingKeys binding={first} always />;
}
