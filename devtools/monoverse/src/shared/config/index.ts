import { posix } from 'node:path';
import type { ContractsRule } from '../contracts/index.ts';
import type { ImportsRule } from '../imports/index.ts';
import { isInside } from '../tree/index.ts';

export const configFile = 'monoverse.json';

export interface Rules {
  readonly imports?: ImportsRule;
  readonly contracts?: ContractsRule;
}

export interface Pass {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

export interface Config {
  readonly sourceRoots: readonly string[];
  readonly ignore: readonly string[];
  readonly rules: Rules;
  readonly exceptions: readonly Pass[];
  readonly restrictions: readonly Pass[];
}

export type PresetName = 'default' | 'kabuki';

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
        'mcp/*/contract',
      ],
    },
    contracts: {
      folders: ['capabilities/*/contract', 'services/*/contract'],
      required: ['services/*/contract'],
    },
  },
};

export type ConfigResult =
  | { readonly ok: true; readonly config: Config }
  | { readonly ok: false; readonly error: string };

export const parseConfig = (text: string): ConfigResult => {
  let json: unknown;
  try {
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

export const matches = (path: string, glob: string): boolean =>
  posix.matchesGlob(path, glob) ||
  posix.matchesGlob(path, `${glob}/**`) ||
  (glob.endsWith('/**') && posix.matchesGlob(path, glob.slice(0, -3)));

export const isChecked = (config: Config, path: string): boolean =>
  config.sourceRoots.some((root) => path === root || isInside(path, root)) &&
  !/\.d\.[cm]?ts$/.test(path) &&
  !/\.min\.[cm]?js$/.test(path) &&
  !config.ignore.some((glob) => matches(path, glob));

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
  keys(
    top,
    [
      '$schema',
      'sourceRoots',
      'ignore',
      'preset',
      'rules',
      'exceptions',
      'restrictions',
    ],
    '',
  );
  if (Object.hasOwn(top, 'preset') === Object.hasOwn(top, 'rules'))
    invalid('needs exactly one of "preset" and "rules".');
  return {
    sourceRoots: strings(top.sourceRoots, 'sourceRoots', true).map(folder),
    ignore:
      top.ignore === undefined ? [] : strings(top.ignore, 'ignore').map(glob),
    rules: Object.hasOwn(top, 'preset') ? preset(top.preset) : rules(top.rules),
    exceptions: passes(top.exceptions, 'exceptions'),
    restrictions: passes(top.restrictions, 'restrictions'),
  };
};

const glob = (entry: string): string =>
  entry.replace(/^(\.\/)+/, '').replace(/\/+$/, '/**');

const passes = (value: unknown, what: string): readonly Pass[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return invalid(`"${what}" must be a list.`);
  return value.map((item: unknown, i) => {
    const at = `${what}[${i}]`;
    const entry = object(item, `"${at}"`);
    keys(entry, ['from', 'to', 'reason'], `${at}.`);
    const path = (key: 'from' | 'to'): string => {
      const text = entry[key];
      if (typeof text !== 'string' || text.trim() === '')
        return invalid(`"${at}.${key}" must be a glob.`);
      if (text.startsWith('/') || text.split('/').includes('..'))
        invalid(
          `"${at}.${key}" is "${text}", which is not inside the package.`,
        );
      return glob(text);
    };
    const reason = entry.reason;
    if (typeof reason !== 'string' || reason.trim() === '')
      invalid(`"${at}.reason" must say why.`);
    return { from: path('from'), to: path('to'), reason: reason as string };
  });
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

const folder = (entry: string): string => {
  if (entry.startsWith('/') || entry.split('/').includes('..'))
    invalid(`"sourceRoots" has "${entry}", which is not inside the package.`);
  const clean = posix.normalize(entry).replace(/\/$/, '');
  return clean === '.' ? '' : clean;
};

const pattern = (entry: string): string => {
  const clean = entry.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (clean === '' || clean.startsWith('/') || clean.split('/').includes('..'))
    invalid(
      `"${entry}" is not a folder path; write a door or contract folder from the folder that owns it, such as "shared" or "services/*/contract".`,
    );
  return clean;
};

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
