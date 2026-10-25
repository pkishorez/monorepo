import { Catalog } from '../capabilities/index.ts';
import type { Model, Props } from './actor.ts';

/*
 * What the Draft's picks come to: a new session's agent, model and
 * settings, each the one picked or its default, a Session's over its own;
 * and the Skills and commands the skills Picker lists for the agent.
 */

/** `/` entries that are not skills, for a Session's Draft. */
const COMMANDS = [
  {
    name: 'btw',
    description: 'Ask about this session without interrupting it',
  },
];

/** What the model Picker is handed before anything is known, which it never opens for. */
export const NOBODY = { account: '', model: null, settings: {} };

/** A new session's agent, as the catalog describes it: the one picked, else the first that runs. */
export const pickedHarness = ({ catalog, chosen }: Model) =>
  Catalog.harnessOf(catalog, chosen.account) ??
  catalog.harnesses?.find(({ available }) => available) ??
  catalog.harnesses?.[0] ??
  null;

/** A new session's model: the one picked, or its agent's default. */
export const pickedModel = (model: Model) =>
  model.chosen.model ?? pickedHarness(model)?.defaultModel ?? null;

/** A new session's settings: each the one picked, or its default. */
export const pickedSettings = (model: Model): Record<string, string> =>
  Object.fromEntries(
    (pickedHarness(model)?.settings ?? []).map(({ key, default: value }) => [
      key,
      model.chosen.settings[key] ?? value,
    ]),
  );

/** The agent, model and settings in effect, for the model Picker; null until they are known. */
export const current = (model: Model, { to }: Props) => {
  if (to._tag === 'Session')
    return to.agent === null
      ? null
      : {
          account: to.agent.account,
          model: model.chosen.model ?? to.agent.model,
          settings: { ...to.agent.settings, ...model.chosen.settings },
        };
  const harness = pickedHarness(model);
  return harness === null
    ? null
    : {
        account: harness.account,
        model: model.chosen.model,
        settings: model.chosen.settings,
      };
};

/** The agent's Skills, and a Session's commands, as the skills Picker lists them. */
export const skillsOf = (model: Model, props: Props) => {
  const account = current(model, props)?.account ?? null;
  const read = Catalog.skillsOf(model.catalog, account);
  const loading =
    read === undefined &&
    (props.to._tag === 'Session' ||
      (model.catalog.harnesses === null
        ? model.catalog.problem === null
        : pickedHarness(model)?.available === true));
  return {
    commands: props.to._tag === 'Session' ? COMMANDS : [],
    skills: read?.list ?? [],
    loading,
    problem: read?.problem ?? null,
  };
};
