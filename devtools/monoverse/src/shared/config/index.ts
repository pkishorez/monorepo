import { posix } from 'node:path';
import type { ContractsRule } from '../contracts/index.ts';
import type { ImportsRule } from '../imports/index.ts';
import { isInside } from '../tree/index.ts';

/*
 * A package's `monoverse.json`, beside its `package.json`. A package
 * with one is checked; a package without one is not.
 *
 *   sourceRoots  the folders the rules check, relative to the package
 *   ignore       globs, relative to the package, of files the rules skip
 *   preset       ready-made rules, `"default"` or `"kabuki"`, or
 *   rules        the package's own: `imports`, `contracts`; one left out is off
 *
 * Exactly one of `preset` and `rules`. Any other key is an error.
 */

/** The file a package's settings live in. */
export const configFile = 'monoverse.json';

/** The rules a package turns on. A rule left out is off. */
export interface Rules {
  readonly imports?: ImportsRule;
  readonly contracts?: ContractsRule;
}

/** A package's settings, its preset already expanded into rules. */
export interface Config {
  /** Folders relative to the package, `''` for the whole package. */
  readonly sourceRoots: readonly string[];
  /** Globs relative to the package. */
  readonly ignore: readonly string[];
  readonly rules: Rules;
}

/** The name of a ready-made set of rules. */
export type PresetName = 'default' | 'kabuki';

/**
 * Ready-made rules, one per folder convention.
 *
 * - `default`: code is shared only through `shared/` folders.
 * - `kabuki`: a Kabuki app. Each Actor shares pure code through
 *   `logic/shared/`, components through `view/shared/`, Actors through
 *   `children/shared/`, and Effect contexts through
 *   `capabilities/*\/contract/` and `services/*\/contract/`. A feature's
 *   browser half reaches its server half only through its RPC
 *   contracts, `server/rpc/contract/` and `server/rpc/*\/contract/`; an
 *   `http/*\/contract/` is open to its server alone.
 */
export const presets: Readonly<Record<PresetName, Rules>> = {
  default: { imports: { doors: ['shared'] } },
  kabuki: {
    imports: {
      doors: [
        'logic/shared',
        'view/shared',
        'children/shared',
        'capabilities/*/contract',
        'services/*/contract',
        'server/rpc/contract',
        'server/rpc/*/contract',
        'http/*/contract',
      ],
    },
    contracts: {
      folders: ['capabilities/*/contract', 'services/*/contract'],
      required: ['services/*/contract'],
    },
  },
};

/** A `monoverse.json` read: its settings, or what is wrong with it. */
export type ConfigResult =
  | { readonly ok: true; readonly config: Config }
  | { readonly ok: false; readonly error: string };

/** Reads the text of a `monoverse.json`. */
export const parseConfig = (text: string): ConfigResult => {
  let json: unknown;
  try {
    // An editor may save the file with a byte order mark; JSON has none.
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (cause) {
    return fail(`is not JSON: ${(cause as Error).message}`);
  }
  try {
    return { ok: true, config: readConfig(json) };
  } catch (cause) {
    if (cause instanceof Invalid) return fail(cause.message);
    throw cause;
  }
};

/**
 * Whether the rules check `path`, a file relative to its package: it
 * sits in a source root, is not a declaration file, and no `ignore` glob
 * matches it.
 */
export const isChecked = (config: Config, path: string): boolean =>
  config.sourceRoots.some((root) => isInside(path, root)) &&
  !/\.d\.[cm]?ts$/.test(path) &&
  !config.ignore.some((glob) => posix.matchesGlob(path, glob));

class Invalid extends Error {}

const fail = (error: string): ConfigResult => ({
  ok: false,
  error: `${configFile} ${error}`,
});

const invalid = (message: string): never => {
  throw new Invalid(message);
};

const readConfig = (json: unknown): Config => {
  const top = object(json, 'the file');
  keys(top, ['$schema', 'sourceRoots', 'ignore', 'preset', 'rules'], '');
  if (Object.hasOwn(top, 'preset') === Object.hasOwn(top, 'rules'))
    invalid('needs exactly one of "preset" and "rules".');
  return {
    sourceRoots: strings(top.sourceRoots, 'sourceRoots', true).map(folder),
    ignore:
      top.ignore === undefined
        ? []
        : strings(top.ignore, 'ignore').map((glob) =>
            glob.replace(/^(\.\/)+/, ''),
          ),
    rules: Object.hasOwn(top, 'preset') ? preset(top.preset) : rules(top.rules),
  };
};

const preset = (value: unknown): Rules => {
  if (typeof value === 'string' && Object.hasOwn(presets, value))
    return presets[value as PresetName];
  return invalid(
    `"preset" is ${JSON.stringify(value)}; use one of ${Object.keys(presets)
      .map((name) => `"${name}"`)
      .join(', ')}.`,
  );
};

const rules = (value: unknown): Rules => {
  const given = object(value, '"rules"');
  keys(given, ['imports', 'contracts'], 'rules.');
  const result: { imports?: ImportsRule; contracts?: ContractsRule } = {};
  if (given.imports !== undefined) {
    const imports = object(given.imports, '"rules.imports"');
    keys(imports, ['doors'], 'rules.imports.');
    result.imports = {
      doors: strings(imports.doors, 'rules.imports.doors').map(pattern),
    };
  }
  if (given.contracts !== undefined) {
    const contracts = object(given.contracts, '"rules.contracts"');
    keys(contracts, ['folders', 'required'], 'rules.contracts.');
    result.contracts = {
      folders: strings(contracts.folders, 'rules.contracts.folders').map(
        pattern,
      ),
      ...(contracts.required === undefined
        ? {}
        : {
            required: strings(
              contracts.required,
              'rules.contracts.required',
            ).map(pattern),
          }),
    };
  }
  return result;
};

/**
 * A source root as written, `src/` or `.`, made a clean relative folder.
 * An absolute path or a `..` anywhere is refused, as the schema refuses it.
 */
const folder = (entry: string): string => {
  if (entry.startsWith('/') || entry.split('/').includes('..'))
    invalid(`"sourceRoots" has "${entry}", which is not inside the package.`);
  const clean = posix.normalize(entry).replace(/\/$/, '');
  return clean === '.' ? '' : clean;
};

/** A door or contract folder as written, `./shared/`, as the rules match it: `shared`. */
const pattern = (entry: string): string =>
  entry.replace(/^(\.\/)+/, '').replace(/\/+$/, '');

const object = (value: unknown, what: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid(`${what} must be an object.`);

const keys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  at: string,
): void => {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined)
    invalid(
      `has "${at}${unknown}", which it does not know. It knows ${allowed
        .map((key) => `"${at}${key}"`)
        .join(', ')}.`,
    );
};

const strings = (
  value: unknown,
  what: string,
  required = false,
): readonly string[] => {
  if (value === undefined && required) invalid(`needs "${what}".`);
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    invalid(`"${what}" must be a list of strings.`);
  const list = value as readonly string[];
  if (required && list.length === 0)
    invalid(`"${what}" must name at least one folder.`);
  return list;
};
