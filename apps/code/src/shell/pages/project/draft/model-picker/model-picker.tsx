import { Schema } from 'effect';
import type { Effect } from 'effect';
import {
  Drawer,
  LayerHeader,
} from '@kestack/web-platform/recipes/touch-layers';
import {
  ChevronDownIcon,
  SlidersHorizontalIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { useState, type ReactNode } from 'react';
import { keys, useBound } from '../../../../../keys.ts';
import * as Picker from '../../../../../ui/picker/index.ts';
import * as Catalog from '../../catalog/index.ts';
import { OpenRow, Setting } from './chip.tsx';

/*
 * The model Picker: the agent, then its model, then each of its settings,
 * such as effort and permissions, one Step each. Mod+Enter finishes on the
 * row highlighted, so the settings can be left as they are. A session that
 * has started keeps its agent, so its Picker opens at the model; the
 * settings button opens it at the first setting. `p` and `e` open it at
 * the agent's permissions or effort alone, so choosing there finishes.
 * What is in effect now is checked in every Step.
 *
 * In the Status Line sit its two triggers, the model and the settings,
 * which give up their words as the line narrows. `m` opens it at the model
 * from the page's Normal Mode. On a device with no keyboard the Draft has
 * one model chip instead, "Opus · High · Bypass permissions", which opens
 * a Drawer: the agent and the model open the Picker in a Dialog, and
 * choosing the model finishes it; each setting is changed there in place.
 */

const trigger =
  'focus-ring inline-flex h-7 min-w-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground motion-reduce:transition-none';

/** The agent, model and settings in effect now. */
const Current = Schema.Struct({
  harness: Schema.String,
  /** null: the agent's default. */
  model: Schema.NullOr(Schema.String),
  /** The settings set; any other is its default. */
  settings: Schema.Record(Schema.String, Schema.String),
});
type Current = typeof Current.Type;
type Catalog = typeof Catalog.Model.Type;
type Choices = ReadonlyArray<{
  readonly step: string;
  readonly key: string;
  readonly value: string;
}>;

const agentOf = (choices: Choices) =>
  choices.find(({ step }) => step === 'agent')?.value ?? null;

/** An agent's model in effect: the one picked, or its default. */
const modelFor = (catalog: Catalog, current: Current, agent: string) =>
  (agent === current.harness ? current.model : null) ??
  Catalog.harnessOf(catalog, agent)?.defaultModel ??
  null;

/** An agent's setting in effect: the one picked, or its default. */
const settingFor = (
  catalog: Catalog,
  current: Current,
  agent: string,
  key: string,
) =>
  (agent === current.harness ? current.settings[key] : undefined) ??
  Catalog.harnessOf(catalog, agent)?.settings.find((each) => each.key === key)
    ?.default ??
  null;

/**
 * Where it opens: at the agent or model, the first setting, or one setting
 * alone; or, from the model chip, at the agent or at the model alone,
 * where choosing the model finishes, since the chip's Drawer holds the
 * settings.
 */
const At = Schema.Literals([
  'model',
  'settings',
  'permissions',
  'effort',
  'agent',
  'modelAlone',
]);
type At = typeof At.Type;

/**
 * The keys an agent may name its permissions or its effort by: the
 * catalog says what each setting is called, never what it is for.
 */
const ASPECTS = {
  permissions: ['permissionMode', 'sandbox'],
  effort: ['effort', 'reasoningEffort'],
} as const;

/** The agent's setting for `aspect`, or null when it has none. */
const aspectOf = (
  catalog: Catalog,
  agent: string | null,
  aspect: keyof typeof ASPECTS,
) =>
  Catalog.harnessOf(catalog, agent)?.settings.find((each) =>
    (ASPECTS[aspect] as ReadonlyArray<string>).includes(each.key),
  ) ?? null;

/** The setting after `key`, or the first: the Step a choice opens next. */
const settingAfter = (
  catalog: Catalog,
  agent: string | null,
  key: string | null,
) => {
  const settings = Catalog.harnessOf(catalog, agent)?.settings ?? [];
  const at =
    key === null ? 0 : settings.findIndex((each) => each.key === key) + 1;
  const next = settings[at];
  return next === undefined ? null : { id: 'setting', key: next.key };
};

/** An agent's setting by its key. */
const settingNamed = (catalog: Catalog, agent: string | null, key: string) =>
  Catalog.harnessOf(catalog, agent)?.settings.find((each) => each.key === key);

/** One setting's choices, the one in effect checked. */
const settingRows = (
  catalog: Catalog,
  current: Current,
  agent: string,
  key: string,
) => {
  const now = settingFor(catalog, current, agent, key);
  return {
    rows: (settingNamed(catalog, agent, key)?.choices ?? []).map(
      ({ value, label }) => ({ value, label, checked: value === now }),
    ),
  };
};

const settingPlaceholder = (
  catalog: Catalog,
  agent: string | null,
  key: string,
) =>
  `Search ${settingNamed(catalog, agent, key)?.label.toLowerCase() ?? 'choices'}`;

const Models = Picker.make('ModelPicker', {
  props: Schema.Struct({
    catalog: Catalog.Model,
    current: Current,
    /** Choosing the model finishes, with no settings after it. */
    alone: Schema.optionalKey(Schema.Boolean),
  }),
  steps: {
    agent: {
      placeholder: () => 'Search agents',
      empty: () => 'No agent by that name',
      rows: ({ props: { catalog, current } }) => ({
        rows: (catalog.harnesses ?? []).map(
          ({ name, label, available, unavailableReason }) => ({
            value: name,
            label,
            checked: name === current.harness,
            ...(available
              ? {}
              : {
                  unavailable:
                    unavailableReason ?? 'It cannot run on this machine',
                }),
          }),
        ),
        loading: catalog.harnesses === null && catalog.problem === null,
        problem: catalog.problem,
      }),
      next: (row) => ({ id: 'model', key: row.value }),
    },
    model: {
      placeholder: ({ key, props }) =>
        `Search ${Catalog.harnessOf(props.catalog, key)?.label ?? ''} models`,
      empty: () => 'No model by that name',
      rows: ({ key, props: { catalog, current } }) => {
        const read = Catalog.modelsOf(catalog, key);
        const now = modelFor(catalog, current, key);
        return {
          rows: (read?.list ?? []).map(({ id, name, releaseDate }) => ({
            value: id,
            label: name,
            checked: id === now,
            ...(releaseDate ? { hint: releaseDate.slice(0, 7) } : {}),
          })),
          loading: read === undefined,
          problem: read?.problem ?? null,
        };
      },
      next: (_, { key, props }) =>
        props.alone === true ? null : settingAfter(props.catalog, key, null),
    },
    setting: {
      search: false,
      placeholder: ({ key, props, choices }) =>
        settingPlaceholder(props.catalog, agentOf(choices), key),
      title: ({ key, props, choices }) =>
        settingNamed(props.catalog, agentOf(choices), key)?.label ?? key,
      rows: ({ key, props: { catalog, current }, choices }) =>
        settingRows(catalog, current, agentOf(choices) ?? current.harness, key),
      next: (_, { key, props, choices }) =>
        settingAfter(props.catalog, agentOf(choices), key),
    },
    // One setting alone, opened by its keys: choosing it finishes.
    alone: {
      search: false,
      placeholder: ({ key, props, choices }) =>
        settingPlaceholder(props.catalog, agentOf(choices), key),
      title: ({ key, props, choices }) =>
        settingNamed(props.catalog, agentOf(choices), key)?.label ?? key,
      rows: ({ key, props: { catalog, current }, choices }) =>
        settingRows(catalog, current, agentOf(choices) ?? current.harness, key),
    },
  },
});

/** What was chosen, to apply over what is in effect. */
const chosenOf = (choices: Choices) => ({
  harness: agentOf(choices),
  model: choices.find(({ step }) => step === 'model')?.value ?? null,
  settings: Object.fromEntries(
    choices.flatMap((choice) =>
      choice.step === 'setting' || choice.step === 'alone'
        ? [[choice.key, choice.value]]
        : [],
    ),
  ),
});

export const ModelPicker = {
  Live: Models.Live,
  View: Models.View,
  /** Where it opens, for an owner's Model. */
  At,
  /**
   * The Input it opens with: at the agent, or at the model once the
   * session has started, at the first setting, or at the permissions or
   * the effort alone; at the model or the agent when it has no such one.
   */
  opening: ({
    how,
    at,
    started,
    catalog,
    current,
  }: {
    readonly how: typeof Picker.How.Type;
    readonly at: At;
    readonly started: boolean;
    readonly catalog: Catalog;
    readonly current: Current;
  }) => {
    const harness = Catalog.harnessOf(catalog, current.harness);
    const agent = {
      step: 'agent',
      key: '',
      value: current.harness,
      label: harness?.label ?? current.harness,
    };
    const model = modelFor(catalog, current, current.harness) ?? '';
    const named =
      Catalog.modelsOf(catalog, current.harness)?.list.find(
        ({ id }) => id === model,
      )?.name ?? model;
    const chosen = [
      agent,
      { step: 'model', key: current.harness, value: model, label: named },
    ];
    const first = settingAfter(catalog, current.harness, null);
    if (at === 'settings' && first !== null)
      return { how, step: first, choices: chosen };
    const alone =
      at === 'permissions' || at === 'effort'
        ? aspectOf(catalog, current.harness, at)
        : null;
    if (alone !== null)
      return { how, step: { id: 'alone', key: alone.key }, choices: chosen };
    if (at === 'agent' && !started)
      return { how, step: { id: 'agent', key: '' }, choices: [] };
    if (at === 'modelAlone' || at === 'agent')
      return {
        how,
        step: { id: 'model', key: current.harness },
        choices: [agent],
      };
    return started
      ? { how, step: { id: 'model', key: current.harness }, choices: [agent] }
      : { how, step: { id: 'agent', key: '' }, choices: [] };
  },
  /** The Layer its owner Provides: `done` hears what was chosen, or null. */
  owner: (
    done: (
      chosen: {
        readonly harness: string | null;
        readonly model: string | null;
        readonly settings: Readonly<Record<string, string>>;
      } | null,
    ) => Effect.Effect<void>,
  ) =>
    Models.owner({
      done: (choices) => done(choices === null ? null : chosenOf(choices)),
    }),
};

/** The model in effect, by its name. */
const modelNamed = (catalog: Catalog, current: Current) => {
  const model = modelFor(catalog, current, current.harness) ?? '';
  return (
    Catalog.modelsOf(catalog, current.harness)?.list.find(
      ({ id }) => id === model,
    )?.name ?? model
  );
};

/** Each of the agent's settings, with the choice in effect and its label. */
const settingsOf = (catalog: Catalog, current: Current) =>
  (Catalog.harnessOf(catalog, current.harness)?.settings ?? []).map(
    (setting) => {
      const value = settingFor(catalog, current, current.harness, setting.key);
      return {
        key: setting.key,
        label:
          setting.choices.find((each) => each.value === value)?.label ??
          value ??
          '',
        shown: {
          key: setting.key,
          label: setting.label,
          choices: setting.choices,
          value,
          segments: (ASPECTS.effort as ReadonlyArray<string>).includes(
            setting.key,
          ),
        },
      };
    },
  );

/**
 * The model and settings triggers in the Status Line, and the Picker drawn
 * by the one it was opened from. `m` opens it at the model, `p` and `e` at
 * the permissions and the effort, drawn by the settings trigger.
 */
export function Triggers({
  catalog,
  current,
  started,
  how,
  onOpen,
  children,
}: {
  readonly catalog: Catalog;
  readonly current: Current | null;
  /** The session has started, so its agent is kept. */
  readonly started: boolean;
  /** How the Picker is open, and from which trigger; null while it is not. */
  readonly how: {
    readonly at: At;
    readonly how: typeof Picker.How.Type;
  } | null;
  readonly onOpen: (at: At, how: typeof Picker.How.Type) => void;
  /** The Picker's View, while it is open. */
  readonly children: ReactNode;
}) {
  const open = Picker.useOpen();
  const modelKeys = useBound('content.model');
  const harness = Catalog.harnessOf(catalog, current?.harness ?? null);
  const agent = harness?.name ?? null;
  keys.useAction('content.model', () => open(() => onOpen('model', 'keys')), {
    enabled: harness !== null,
  });
  keys.useAction(
    'content.permissions',
    () => open(() => onOpen('permissions', 'keys')),
    { enabled: aspectOf(catalog, agent, 'permissions') !== null },
  );
  keys.useAction('content.effort', () => open(() => onOpen('effort', 'keys')), {
    enabled: aspectOf(catalog, agent, 'effort') !== null,
  });
  if (current === null || harness === null)
    return (
      <div className="flex gap-2 px-1">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-10" />
      </div>
    );
  const name = modelNamed(catalog, current);
  const summary = settingsOf(catalog, current)
    .map(({ label }) => label)
    .join(' · ');
  // The permissions or the effort alone are drawn by the settings trigger.
  const drawnBy = (opened: At) =>
    opened === 'settings' ||
    ((opened === 'permissions' || opened === 'effort') &&
      aspectOf(catalog, agent, opened) !== null)
      ? 'settings'
      : 'model';
  const at = (which: 'model' | 'settings') =>
    how !== null && drawnBy(how.at) === which ? how.how : null;
  return (
    <>
      <Picker.Frame
        how={at('model')}
        mode="dialog"
        label="Model"
        onOpen={() => onOpen('model', 'pointer')}
        className="w-72"
        trigger={
          <button
            type="button"
            aria-label={`Model: ${started ? '' : `${harness.label}, `}${name}`}
            title={modelKeys === null ? 'Model' : `Model (${modelKeys})`}
            className={trigger}
          >
            {!started && (
              <span className="hidden shrink-0 text-muted-foreground/80 @sm/status:inline">
                {harness.label}
              </span>
            )}
            <span className="truncate text-foreground/90">{name}</span>
            <ChevronDownIcon
              aria-hidden
              className="size-3 shrink-0 opacity-60"
            />
          </button>
        }
      >
        {at('model') !== null && children}
      </Picker.Frame>
      {harness.settings.length > 0 && (
        <Picker.Frame
          how={at('settings')}
          mode="drawer"
          label="Settings"
          onOpen={() => onOpen('settings', 'pointer')}
          className="w-64"
          trigger={
            <button
              type="button"
              aria-label={`Settings: ${summary}`}
              title={summary}
              className={cn(trigger, 'shrink-0 @md/status:shrink')}
            >
              <SlidersHorizontalIcon
                aria-hidden
                className="size-3.5 shrink-0"
              />
              <span className="hidden truncate text-foreground/90 @md/status:inline">
                {summary}
              </span>
            </button>
          }
        >
          {at('settings') !== null && children}
        </Picker.Frame>
      )}
    </>
  );
}

/**
 * A model's name without its agent's: "Haiku 4.5" for Claude Code's
 * "Claude Haiku 4.5", which says it again.
 */
const shortName = (name: string, agent: string) => {
  const [first = '', ...rest] = name.split(' ');
  return rest.length > 0 && first === agent.split(' ')[0]
    ? rest.join(' ')
    : name;
};

/**
 * The model chip, on a device with no keyboard: the model and its settings
 * in one line. It opens a Drawer, which stays until it is swiped away: the
 * agent, while the session has not started, and the model open the Picker
 * in a Dialog, closing the Drawer; each setting changes in place.
 */
export function Chip({
  catalog,
  current,
  started,
  how,
  onOpen,
  onSet,
  children,
}: {
  readonly catalog: Catalog;
  readonly current: Current | null;
  /** The session has started, so its agent is kept. */
  readonly started: boolean;
  /** How the Picker is open; null while it is not. */
  readonly how: typeof Picker.How.Type | null;
  /** Opens the Picker at the agent, or at the model alone. */
  readonly onOpen: (at: 'agent' | 'modelAlone') => void;
  /** Sets one of the agent's settings, in place. */
  readonly onSet: (key: string, value: string) => void;
  /** The Picker's View, while it is open. */
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openPicker = Picker.useOpen();
  const harness = Catalog.harnessOf(catalog, current?.harness ?? null);
  if (current === null || harness === null)
    return <Skeleton className="h-11 w-32 rounded-full" />;
  const name = modelNamed(catalog, current);
  const settings = settingsOf(catalog, current);
  const words = [name, ...settings.map(({ label }) => label)].join(' · ');
  const pick = (at: 'agent' | 'modelAlone') => {
    setOpen(false);
    openPicker(() => onOpen(at));
  };
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Model and settings: ${started ? '' : `${harness.label}, `}${words}`}
        onClick={() => setOpen(true)}
        className="focus-ring flex h-11 min-w-0 items-center rounded-full px-3 text-left transition-colors duration-150 active:bg-muted aria-expanded:bg-muted motion-reduce:transition-none"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm leading-4.5 font-medium text-foreground/90">
            {shortName(name, harness.label)}
          </span>
          {settings.length > 0 && (
            <span className="truncate text-xs leading-4 text-muted-foreground">
              {settings.map(({ label }) => label).join(' · ')}
            </span>
          )}
        </span>
      </button>
      <Drawer
        open={open}
        onOpenChange={(next) => setOpen(next)}
        label="Model and settings"
      >
        <LayerHeader title="Model and settings" />
        <div className="flex flex-col overflow-y-auto overscroll-contain pb-2">
          {!started && (
            <OpenRow
              label="Agent"
              value={harness.label}
              onOpen={() => pick('agent')}
            />
          )}
          <OpenRow
            label="Model"
            value={name}
            onOpen={() => pick('modelAlone')}
          />
          {settings.map(({ key, shown }) => (
            <Setting
              key={key}
              setting={shown}
              onSet={(value) => onSet(key, value)}
            />
          ))}
        </div>
      </Drawer>
      <Picker.Frame how={how} mode="dialog" label="Model">
        {how !== null && children}
      </Picker.Frame>
    </>
  );
}
