import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Input } from '@kstackz/ui-toolkit/components/ui/input';
import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@kstackz/ui-toolkit/components/ui/toggle-group';
import { SlidersHorizontalIcon, XIcon } from '@kstackz/ui-toolkit/lucide';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { type ComponentType, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/** One setting an Example lets you change: its kind, name, check and default. */
export type Tweak<Value> = {
  readonly label: string;
  readonly default: Value;
  /** What a saved value must pass, or the default is used instead. */
  readonly schema: Schema.Codec<Value, unknown>;
} & (
  | {
      readonly kind: 'choice';
      readonly options: Readonly<Record<string, string>>;
    }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'text' }
);

/** The kinds of Tweak: one of a few choices, on or off, or free text. */
export const tweak = {
  choice: <const Value extends string>(
    label: string,
    options: Readonly<Record<Value, string>>,
    defaultValue: NoInfer<Value>,
  ): Tweak<Value> => ({
    kind: 'choice',
    label,
    options,
    default: defaultValue,
    schema: Schema.Literals(Object.keys(options) as Array<Value>) as never,
  }),
  boolean: (label: string, defaultValue: boolean): Tweak<boolean> => ({
    kind: 'boolean',
    label,
    default: defaultValue,
    schema: Schema.Boolean as never,
  }),
  text: (label: string, defaultValue: string): Tweak<string> => ({
    kind: 'text',
    label,
    default: defaultValue,
    schema: Schema.String as never,
  }),
};

type Tweaks = Readonly<Record<string, Tweak<unknown>>>;

export type TweakValues<T extends Tweaks> = {
  readonly [Key in keyof T]: T[Key]['default'];
};

type Values = Readonly<Record<string, unknown>>;

/** One Example's values, shared by every useTweaks call with its name. */
interface Store {
  readonly defaults: Values;
  values: Values;
  /** Whether its panel is open: it stays so until its button or ✕ shuts it. */
  panelOpen: boolean;
  readonly listeners: Set<() => void>;
}

const stores = new Map<string, Store>();

const defaultsOf = (tweaks: Tweaks): Values =>
  Object.fromEntries(
    Object.entries(tweaks).map(([key, t]) => [key, t.default]),
  );

// Each saved value that fails its Tweak's schema falls back to its default.
const load = (storageKey: string, tweaks: Tweaks): Values => {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? '{}',
    );
    if (typeof parsed === 'object' && parsed !== null) {
      saved = parsed as Record<string, unknown>;
    }
  } catch {
    // Unreadable or blocked storage: every default.
  }
  return Object.fromEntries(
    Object.entries(tweaks).map(([key, t]) => [
      key,
      Option.getOrElse(
        Schema.decodeUnknownOption(t.schema)(saved[key]),
        () => t.default,
      ),
    ]),
  );
};

const storeFor = (name: string, tweaks: Tweaks): Store => {
  let store = stores.get(name);
  if (store === undefined) {
    const defaults = defaultsOf(tweaks);
    store = {
      defaults,
      values:
        typeof window === 'undefined'
          ? defaults
          : load(`tweak:${name}`, tweaks),
      panelOpen: false,
      listeners: new Set(),
    };
    stores.set(name, store);
  }
  return store;
};

const setValues = (name: string, store: Store, values: Values) => {
  store.values = values;
  try {
    localStorage.setItem(`tweak:${name}`, JSON.stringify(values));
  } catch {
    // Storage blocked: the change still applies until the page reloads.
  }
  for (const listener of store.listeners) listener();
};

const setPanelOpen = (store: Store, open: boolean) => {
  store.panelOpen = open;
  for (const listener of store.listeners) listener();
};

const useStoreValue = <Value,>(
  store: Store,
  read: (store: Store) => Value,
  // What the server renders, and so hydration too.
  onServer: Value,
) =>
  useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    () => read(store),
    () => onServer,
  );

// The server has no storage; hydration renders the defaults, then React
// re-renders with the saved values.
const useStore = (name: string, tweaks: Tweaks) => {
  const store = storeFor(name, tweaks);
  return useStoreValue(store, (s) => s.values, store.defaults);
};

function Control(props: {
  readonly tweak: Tweak<unknown>;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}) {
  const { tweak: t } = props;
  switch (t.kind) {
    case 'choice':
      return (
        <ToggleGroup
          variant="outline"
          spacing={0}
          className="w-full"
          value={[props.value as string]}
          onValueChange={(value) => {
            if (value[0] !== undefined) props.onChange(value[0]);
          }}
        >
          {Object.entries(t.options).map(([value, label]) => (
            <ToggleGroupItem
              key={value}
              value={value}
              // Muted barely shows on a popover; the choice must read at a glance.
              className="flex-1 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      );
    case 'boolean':
      return (
        <Switch
          checked={props.value as boolean}
          onCheckedChange={(checked) => props.onChange(checked)}
          aria-label={t.label}
        />
      );
    case 'text':
      return (
        <Input
          value={props.value as string}
          onChange={(event) => props.onChange(event.target.value)}
          aria-label={t.label}
        />
      );
  }
}

const makeButton = (name: string, tweaks: Tweaks): ComponentType =>
  function TweaksButton() {
    const values = useStore(name, tweaks);
    const store = storeFor(name, tweaks);
    const open = useStoreValue(store, (s) => s.panelOpen, false);
    const keys = Object.keys(tweaks);
    const changed = keys.some((key) => values[key] !== store.defaults[key]);
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-11 rounded-full hover:bg-transparent aria-expanded:bg-transparent md:size-8 dark:hover:bg-transparent"
          aria-label="Tweak this example"
          aria-expanded={open}
          aria-pressed={open}
          onClick={() => setPanelOpen(store, !open)}
        >
          <SlidersHorizontalIcon aria-hidden="true" />
          {changed ? (
            <span
              aria-hidden="true"
              className="absolute top-2 right-2 size-1.5 rounded-full bg-primary md:top-1 md:right-1"
            />
          ) : null}
        </Button>
        {open
          ? // Over everything and outside the app, so it stays put and usable
            // while the app moves under it: nothing it does shuts it.
            createPortal(
              <section
                aria-label="Tweaks"
                className="fixed top-[calc(env(safe-area-inset-top)+4rem)] right-3 z-1000 flex max-h-[calc(100dvh-env(safe-area-inset-top)-5rem)] w-72 flex-col gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 md:top-14"
              >
                <header className="flex items-center justify-between">
                  <h2 className="font-medium">Tweaks</h2>
                  <div className="-my-1 -mr-2 flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!changed}
                      onClick={() => setValues(name, store, store.defaults)}
                    >
                      Reset
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Close tweaks"
                      onClick={() => setPanelOpen(store, false)}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </div>
                </header>
                {keys.map((key) => {
                  const t = tweaks[key]!;
                  const control = (
                    <Control
                      tweak={t}
                      value={values[key]}
                      onChange={(value) =>
                        setValues(name, store, {
                          ...store.values,
                          [key]: value,
                        })
                      }
                    />
                  );
                  return t.kind === 'boolean' ? (
                    <label
                      key={key}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>{t.label}</span>
                      {control}
                    </label>
                  ) : (
                    <div key={key} className="flex flex-col gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t.label}
                      </span>
                      {control}
                    </div>
                  );
                })}
              </section>,
              document.body,
            )
          : null}
      </>
    );
  };

/**
 * An Example's Tweaks: the settings you change while using it to see its
 * variations. Returns the current values and the button that opens their
 * panel, for the header's right edge. The panel is pinned over the top of the
 * screen and stays open while you use the Example, so every change shows live. Values are saved in the browser as `tweak:<name>`,
 * and every call with the same name shares them.
 */
export function useTweaks<const T extends Tweaks>(
  name: string,
  tweaks: T,
): readonly [TweakValues<T>, ComponentType] {
  const values = useStore(name, tweaks);
  // One component per name, so the open panel survives a change.
  const Tweaks = useMemo(() => makeButton(name, tweaks), [name, tweaks]);
  return [values as TweakValues<T>, Tweaks];
}
