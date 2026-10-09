import {
  type Binding,
  describe,
  sequence,
  type Shortcut,
  shortcut,
} from '@kstackz/use-keys';
import { type Bindings, definition } from './keys.ts';

/** Bindings as they are stored: one written key per Action, `mod+k`, `g g`. */
export type WrittenKeys = Readonly<Record<string, string>>;

/** The stored keys as Bindings; any that no longer read are left out. */
export const bindingsOf = (written: WrittenKeys): Bindings => {
  const out: Record<string, ReadonlyArray<Binding>> = {};
  for (const [id, text] of Object.entries(written)) {
    try {
      out[id] = [
        text.includes(' ')
          ? sequence(
              text.split(' ') as unknown as Parameters<typeof sequence>[0],
            )
          : shortcut(text as Parameters<typeof shortcut>[0]),
      ];
    } catch {
      // A key this version cannot read: the Action keeps its default.
    }
  }
  return out as Bindings;
};

/** One Binding as it is stored. */
export const written = (binding: Binding) => describe(binding);

/** Recorded steps: one is a Shortcut, more a Sequence. */
export const bindingOf = (steps: ReadonlyArray<Shortcut>): Binding =>
  steps.length === 1 ? (steps[0] as Shortcut) : { type: 'sequence', steps };

type Level = {
  readonly actions?: Readonly<Record<string, unknown>>;
  readonly surfaces?: Readonly<Record<string, Level>>;
};

// Every Action id of a level and the Surfaces inside it: `next`, `entries.open`.
const idsOf = (level: Level, prefix: string): ReadonlyArray<string> => [
  ...Object.keys(level.actions ?? {}).map((id) => prefix + id),
  ...Object.entries(level.surfaces ?? {}).flatMap(([name, inner]) =>
    idsOf(inner, `${prefix}${name}.`),
  ),
];

/** Every Action id of Ledger. */
export const ACTION_IDS = idsOf(definition, '');

// With Keys off these still work: finding a Command, and the keys of
// what is open over a Place, which close and choose as any dialog does.
const KEPT = [
  'openPalette',
  'palette.',
  'add.',
  'account.',
  'settings.recording.',
];

/** The Bindings with Keys off: every other Action has no key. */
export const keysOff = (bindings: Bindings): Bindings => {
  const out: Record<string, ReadonlyArray<Binding>> = { ...bindings };
  for (const id of ACTION_IDS) {
    if (!KEPT.some((kept) => id === kept || id.startsWith(kept))) out[id] = [];
  }
  return out as Bindings;
};
