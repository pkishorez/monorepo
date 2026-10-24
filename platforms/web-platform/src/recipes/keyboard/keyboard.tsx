import type { Definition, Keys, SurfaceName } from '@kestack/use-keys/surfaces';
import { X } from 'lucide-react';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#components/dialog';
import { cn } from '#lib/utils';
import { BindingKeys } from '../../ui/input/keys/index.ts';

// The Surfaces that only hold Actions: never somewhere the user is.
const holdersOf = (definition: Definition, found = new Set<string>()) => {
  for (const [name, surface] of Object.entries(definition)) {
    if (surface.focusable === false) found.add(name);
    if (surface.surfaces) holdersOf(surface.surfaces, found);
  }
  return found;
};

/**
 * The status line of the Vim window, like Vim's own: the Mode, where the
 * user is, the Sequence under way, help, and a button that turns Vim Mode
 * off. The Mode is drawn as a coloured label, Normal in the primary colour
 * and Insert in a green of its own, `--vim-insert`, so it reads at a glance. Where the user
 * is leaves out the Surfaces that are not Focusable,
 * such as the app's own. Put it in `AppShell`'s `vim.statusLine`, which shows it only while
 * Vim Mode is on. While it is on, `<html>` carries `data-vim`, so dialogs,
 * menus and the frame open and close at once.
 */
export function KeysStatusBar<D extends Definition>(props: {
  readonly keys: Keys<D>;
  /** Opens the help sheet; without it, no help button. */
  readonly onHelp?: () => void;
  readonly className?: string;
}) {
  const { path, names, mode, pending, vim } = props.keys.useKeyboard();
  const holders = useMemo(
    () => holdersOf(props.keys.definition),
    [props.keys.definition],
  );
  const where = names.filter((_, i) => !holders.has(path[i] ?? ''));
  useEffect(() => {
    if (!vim.on) return;
    document.documentElement.setAttribute('data-vim', '');
    return () => document.documentElement.removeAttribute('data-vim');
  }, [vim.on]);
  const insert = mode === 'insert';
  return (
    <div
      role="status"
      data-slot="keys-status-bar"
      data-mode={insert ? 'insert' : 'normal'}
      className={cn(
        'flex h-9 items-center gap-3 border-t border-border bg-sidebar px-2 font-mono text-xs text-sidebar-foreground',
        props.className,
      )}
    >
      {/* The Mode, in a colour of its own: Normal the primary's, Insert green (`--vim-insert`). */}
      <span
        className={cn(
          'rounded-md px-2 py-1 leading-none font-semibold tracking-wider',
          insert
            ? 'bg-(--vim-insert) text-(--vim-insert-foreground)'
            : 'bg-primary text-primary-foreground',
        )}
      >
        {insert ? 'INSERT' : 'NORMAL'}
      </span>
      <span className="min-w-0 truncate text-muted-foreground">
        {where.join(' › ')}
      </span>
      {pending === null ? null : <span>{pending}…</span>}
      <span className="flex-1" />
      {props.onHelp === undefined ? null : (
        <button
          type="button"
          onClick={props.onHelp}
          className="text-muted-foreground hover:text-sidebar-foreground"
        >
          ? help
        </button>
      )}
      <button
        type="button"
        aria-label="Turn Vim Mode off"
        title="Turn Vim Mode off"
        onClick={() => vim.set(false)}
        className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * Every Action that worked where the user was when it opened, grouped by
 * Surface, nearest first; Shadowed ones faded. It is drawn while
 * `surface`, an Isolated Surface of the app's definition, is Active: an
 * Action that `enters` it opens it, and Escape leaves it, which closes it.
 */
export function KeysHelp<D extends Definition>(props: {
  readonly keys: Keys<D>;
  readonly surface: SurfaceName<D>;
  /**
   * Where focus goes as it closes, as Base UI's dialog takes it: `false`
   * leaves it to the keyboard, which puts it back as the Surface is left.
   */
  readonly finalFocus?: ComponentProps<typeof DialogContent>['finalFocus'];
}) {
  const { keys, surface, finalFocus } = props;
  const { active } = keys.useSurface(surface);
  const { path, names, leave } = keys.useKeyboard();
  const actions = keys.useAvailableActions();
  const live = useMemo(() => {
    const named = new Map<string, string>(
      path.map((name, i) => [name, names[i] ?? name]),
    );
    const groups = new Map<string, typeof actions>();
    for (const action of actions) {
      groups.set(action.surface, [
        ...(groups.get(action.surface) ?? []),
        action,
      ]);
    }
    return [...groups].map(([name, list]) => ({
      surface: name,
      name: named.get(name) ?? name,
      list,
    }));
  }, [actions, path, names]);
  // Once open, the help sheet is the Active Surface: show what worked before.
  const [shown, setShown] = useState(live);
  if (!active && shown !== live) setShown(live);

  return (
    <Dialog
      open={active}
      onOpenChange={(open, details) => {
        // Escape is the keyboard's: it leaves the Surface, which closes this.
        // The dialog stops the key unless told to let it through.
        if (details.reason === 'escape-key') {
          details.cancel();
          details.allowPropagation();
        } else if (!open) leave(surface);
      }}
    >
      <keys.Surface id={surface} asChild>
        <DialogContent
          {...(finalFocus === undefined ? {} : { finalFocus })}
          className="max-h-[80dvh] overflow-y-auto sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>Keys</DialogTitle>
          </DialogHeader>
          {shown.map((group) => (
            <section key={group.surface} className="grid gap-1">
              <h3 className="text-xs font-medium text-muted-foreground">
                {group.name}
              </h3>
              {group.list.map((action) => (
                <div
                  key={action.id}
                  className={cn(
                    'flex items-center justify-between gap-4 py-0.5',
                    action.shadowed && 'opacity-50',
                  )}
                >
                  <span>{action.label}</span>
                  <span className="flex gap-1.5">
                    {action.keys.map((binding, i) => (
                      <BindingKeys key={i} binding={binding} always />
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </DialogContent>
      </keys.Surface>
    </Dialog>
  );
}

/**
 * A scrim behind an Isolated Surface the app draws itself, such as a
 * palette. Making the page behind `inert` stays the app's own choice.
 */
export function SurfaceScrim(props: { readonly onClick?: () => void }) {
  return (
    <div aria-hidden="true" data-slot="surface-scrim" onClick={props.onClick} />
  );
}
