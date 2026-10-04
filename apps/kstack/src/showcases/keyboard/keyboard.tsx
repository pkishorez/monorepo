import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { ArrowLeftIcon } from '@kstackz/ui-toolkit/lucide';
import type { Binding } from '@kstackz/use-keys';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { appTheme } from '../../common/theme.ts';
import { loadBindings, saveBindings } from './bindings.ts';
import { CheatSheet } from './cheat-sheet.tsx';
import { type ActionId, type Bindings, keys, type Surface } from './keys.ts';
import { Notes } from './notes.tsx';
import { Palette } from './palette.tsx';
import { Settings } from './settings.tsx';
import { StatusBar } from './status-bar.tsx';

/**
 * The Keyboard Showcase: a notes app run from the keyboard. The app keeps
 * the Active Surface and the user's own keys; `keys.ts` says what every key
 * does on every Surface.
 */
export function KeyboardShowcase() {
  const [surface, setSurface] = useState<Surface>('notes');
  const [bindings, setBindings] = useState<Bindings>({});
  useEffect(() => setBindings(loadBindings()), []);

  const change = (id: ActionId, binding: Binding | undefined) =>
    setBindings((before) => {
      const { [id]: _, ...rest } = before;
      const next = binding === undefined ? rest : { ...rest, [id]: [binding] };
      saveBindings(next);
      return next;
    });

  return (
    <keys.Provider
      surface={surface}
      onSurfaceChange={setSurface}
      bindings={bindings}
    >
      <Screen onChange={change} bindings={bindings} />
    </keys.Provider>
  );
}

function Screen(props: {
  readonly bindings: Bindings;
  readonly onChange: (id: ActionId, binding: Binding | undefined) => void;
}) {
  const { surface } = keys.useSurface();
  const [help, setHelp] = useState(true);
  keys.useAction('help', () => setHelp((open) => !open));
  keys.useAction('hide', () => setHelp(false), { enabled: help });

  // The palette and the settings show themselves while their Surface is
  // Open, and close themselves back to whoever opened them.
  return (
    <>
      <div
        className="flex h-dvh flex-col"
        style={{ viewTransitionName: 'showcase' }}
      >
        <appTheme.StatusBar />
        <header className="flex h-12 items-center gap-2 border-b border-border px-2">
          <Link
            to="/"
            aria-label="All showcases"
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <ArrowLeftIcon />
          </Link>
          <h1 className="font-semibold">Keyboard</h1>
          <ActiveSurface surface={surface} />
        </header>
        <div className="flex min-h-0 flex-1">
          <Notes />
          {help && <CheatSheet />}
        </div>
        <StatusBar />
        <Palette />
        <Settings bindings={props.bindings} onChange={props.onChange} />
      </div>
    </>
  );
}

/** The Active Surface as a path, its last part the one you are in. */
function ActiveSurface(props: { readonly surface: Surface }) {
  const parts = props.surface?.split('.') ?? [];
  return (
    <div className="ml-auto flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Active Surface</span>
      {parts.length === 0 ? (
        <span className="text-muted-foreground">none</span>
      ) : (
        parts.map((part, i) => (
          <span key={part} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">›</span>}
            <span
              className={
                i === parts.length - 1
                  ? 'rounded-md bg-primary px-2 py-0.5 font-medium text-primary-foreground'
                  : 'text-muted-foreground'
              }
            >
              {part}
            </span>
          </span>
        ))
      )}
    </div>
  );
}
