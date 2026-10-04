import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Kbd } from '@kstackz/ui-toolkit/components/ui/kbd';
import type { Binding, Shortcut } from '@kstackz/use-keys';
import { useKeys } from '@kstackz/use-keys';
import { useEffect, useRef, useState } from 'react';
import { BindingKeys, surfaceOf } from './binding-keys.tsx';
import { bindingOf, recorded } from './bindings.ts';
import { type ActionId, type Bindings, keys } from './keys.ts';

// Ms after the last key before a recording ends: one key is a Shortcut,
// several a Sequence.
const SETTLE = 900;

type SettingsProps = {
  readonly bindings: Bindings;
  readonly onChange: (id: ActionId, binding: Binding | undefined) => void;
};

/**
 * The settings, whole: the key that opens them, the dialog shown while
 * their Surface is Open (it, or recording inside it, is Active), and
 * closing them back to whoever opened them.
 */
export function Settings(props: SettingsProps) {
  const { surface, openSurface } = keys.useSurface();
  keys.useAction('customize', () => openSurface('settings'));
  const open = surface === 'settings' || surface?.startsWith('settings.');
  return open ? <Dialog {...props} /> : null;
}

/**
 * Every Action with its keys. Recording opens the recording Surface, where
 * only Escape works, so any other key can be recorded; the new keys work
 * the moment they are saved.
 */
function Dialog(props: SettingsProps) {
  const { surface, openSurface, closeSurface } = keys.useSurface();
  const close = () => closeSurface('settings');
  const { actions } = keys.useStatus();
  const [recording, setRecording] = useState<ActionId>();
  const [steps, setSteps] = useState<ReadonlyArray<Shortcut>>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stop = () => {
    clearTimeout(timer.current);
    setRecording(undefined);
    setSteps([]);
    closeSurface('settings.recording');
  };
  const record = (id: ActionId) => {
    setRecording(id);
    openSurface('settings.recording');
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  keys.useAction('settings.close', close);
  keys.useAction('settings.recording.cancel', stop);

  useKeys({
    enabled: surface === 'settings.recording',
    onKey: (key, all) => {
      if (key.upAt !== null || key.name === 'Escape') return;
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(key.name)) return;
      const held = new Set(
        all.filter((other) => other.upAt === null).map((other) => other.name),
      );
      const next = [...steps, recorded(key.name, held)];
      setSteps(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (recording) props.onChange(recording, bindingOf(next));
        stop();
      }, SETTLE);
    },
  });

  const groups = Map.groupBy(actions, (action) => surfaceOf(action.id));
  return (
    <div className="fixed inset-0 z-10 flex justify-center overflow-y-auto bg-background/95 px-8 pb-8">
      <div className="w-full max-w-2xl">
        <div className="sticky top-0 z-10 -mx-8 mb-6 flex items-center justify-between bg-background/95 px-8 py-3 backdrop-blur">
          <h2 className="text-xl font-semibold">Keys</h2>
          <Button variant="ghost" onClick={close}>
            Done <Kbd>Esc</Kbd>
          </Button>
        </div>
        {[...groups].map(([group, list]) => (
          <section key={group} className="mb-6">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {group}
            </h3>
            <ul className="divide-y divide-border rounded-lg ring-1 ring-edge">
              {list.map((action) => {
                const id = action.id;
                const own = id in props.bindings;
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="flex-1">{action.description}</span>
                    {recording === id ? (
                      <span className="text-primary">
                        {steps.length === 0
                          ? 'Press the new keys…'
                          : steps.map((step, i) => (
                              <BindingKeys key={i} binding={step} />
                            ))}
                      </span>
                    ) : (
                      action.bindings.map(({ binding }, i) => (
                        <BindingKeys key={i} binding={binding} />
                      ))
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={recording !== undefined}
                      onClick={() => record(id)}
                    >
                      Record
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!own}
                      onClick={() => props.onChange(id, undefined)}
                    >
                      Reset
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
