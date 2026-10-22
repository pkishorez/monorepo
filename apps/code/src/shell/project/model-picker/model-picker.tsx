import { Schema } from 'effect';
import type { Effect } from 'effect';
import {
  ChevronDownIcon,
  SlidersHorizontalIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { cn } from '@kestack/web-platform/components/utils';
import type { ReactNode } from 'react';
import { keys, useBound } from '../../../keys.ts';
import * as Picker from '../../../ui/picker/index.ts';
import * as Catalog from '../catalog/index.ts';

/*
 * The model Picker: the agent, then its model, then each of its settings,
 * such as effort and permissions, one Step each. Mod+Enter finishes on the
 * row highlighted, so the settings can be left as they are. A session that
 * has started keeps its agent, so its Picker opens at the model; the
 * settings button opens it at the first setting. What is in effect now is
 * checked in every Step.
 *
 * Under the composer sit its two triggers, the model and the settings,
 * which give up their words as the row narrows. Ctrl+M opens it from the
 * page, even while typing.
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

const Models = Picker.make('ModelPicker', {
  props: Schema.Struct({ catalog: Catalog.Model, current: Current }),
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
      next: (_, { key, props }) => settingAfter(props.catalog, key, null),
    },
    setting: {
      placeholder: ({ key, props, choices }) =>
        `Search ${
          Catalog.harnessOf(props.catalog, agentOf(choices))
            ?.settings.find((each) => each.key === key)
            ?.label.toLowerCase() ?? 'choices'
        }`,
      title: ({ key, props, choices }) =>
        Catalog.harnessOf(props.catalog, agentOf(choices))?.settings.find(
          (each) => each.key === key,
        )?.label ?? key,
      rows: ({ key, props: { catalog, current }, choices }) => {
        const agent = agentOf(choices) ?? current.harness;
        const now = settingFor(catalog, current, agent, key);
        const setting = Catalog.harnessOf(catalog, agent)?.settings.find(
          (each) => each.key === key,
        );
        return {
          rows: (setting?.choices ?? []).map(({ value, label }) => ({
            value,
            label,
            checked: value === now,
          })),
        };
      },
      next: (_, { key, props, choices }) =>
        settingAfter(props.catalog, agentOf(choices), key),
    },
  },
});

/** What was chosen, to apply over what is in effect. */
const chosenOf = (choices: Choices) => ({
  harness: agentOf(choices),
  model: choices.find(({ step }) => step === 'model')?.value ?? null,
  settings: Object.fromEntries(
    choices.flatMap((choice) =>
      choice.step === 'setting' ? [[choice.key, choice.value]] : [],
    ),
  ),
});

export const ModelPicker = {
  Live: Models.Live,
  View: Models.View,
  /**
   * The Input it opens with: at the agent, or at the model once the
   * session has started, or at the first setting.
   */
  opening: ({
    how,
    at,
    started,
    catalog,
    current,
  }: {
    readonly how: typeof Picker.How.Type;
    readonly at: 'model' | 'settings';
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
    const first = settingAfter(catalog, current.harness, null);
    if (at === 'settings' && first !== null)
      return {
        how,
        step: first,
        choices: [
          agent,
          { step: 'model', key: current.harness, value: model, label: named },
        ],
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

/**
 * The model and settings triggers under a composer, and the Picker drawn
 * by the one it was opened from. Ctrl+M opens it at the model.
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
    readonly at: 'model' | 'settings';
    readonly how: typeof Picker.How.Type;
  } | null;
  readonly onOpen: (
    at: 'model' | 'settings',
    how: typeof Picker.How.Type,
  ) => void;
  /** The Picker's View, while it is open. */
  readonly children: ReactNode;
}) {
  const open = Picker.useOpen();
  const modelKeys = useBound('content.model');
  const harness = Catalog.harnessOf(catalog, current?.harness ?? null);
  keys.useAction('content.model', () => open(() => onOpen('model', 'keys')), {
    enabled: harness !== null,
  });
  if (current === null || harness === null)
    return (
      <div className="flex gap-2 px-1">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-10" />
      </div>
    );
  const model = modelFor(catalog, current, current.harness) ?? '';
  const name =
    Catalog.modelsOf(catalog, current.harness)?.list.find(
      ({ id }) => id === model,
    )?.name ?? model;
  const summary = harness.settings
    .map((setting) => {
      const value = settingFor(catalog, current, current.harness, setting.key);
      return (
        setting.choices.find((each) => each.value === value)?.label ?? value
      );
    })
    .join(' · ');
  const at = (which: 'model' | 'settings') =>
    how?.at === which ? how.how : null;
  return (
    <>
      <Picker.Frame
        how={at('model')}
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
              <span className="hidden shrink-0 text-muted-foreground/80 @sm/composer:inline">
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
          label="Settings"
          onOpen={() => onOpen('settings', 'pointer')}
          className="w-64"
          trigger={
            <button
              type="button"
              aria-label={`Settings: ${summary}`}
              title={summary}
              className={cn(trigger, 'shrink-0 @md/composer:shrink')}
            >
              <SlidersHorizontalIcon
                aria-hidden
                className="size-3.5 shrink-0"
              />
              <span className="hidden truncate text-foreground/90 @md/composer:inline">
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
