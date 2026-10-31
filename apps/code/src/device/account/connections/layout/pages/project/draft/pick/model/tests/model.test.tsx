// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { keys } from '../../../../../../commands.ts';
import * as Picker from '../../../../../../../../../../ui/controls/picker/index.ts';
import * as Catalog from '../../../../store.ts';
import { Chip, ModelPicker, Triggers } from '../model.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The model Picker on a page that keeps the agent, model and settings, as
 * the new-session page does, with an editor as the page's default Focus
 * Spot. `m` opens it at the agent; each choice opens the next Step, and
 * Mod+Enter finishes on the row highlighted. `p` and `e` open it at the
 * permissions or the effort alone, where choosing finishes. Focus comes
 * back to the editor. On a device with no keyboard the model chip opens a
 * Drawer instead: each setting changes there in place, and the agent and
 * the model open the Picker in a Sheet, where the model finishes it.
 */

// A device with no keyboard: the model chip in place of the triggers.
let chip = false;

const setting = {
  key: 'effort',
  label: 'Effort',
  choices: [
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
  ],
  default: 'low',
};

const permissions = {
  key: 'permissionMode',
  label: 'Permissions',
  choices: [
    { value: 'bypassPermissions', label: 'Bypass permissions' },
    { value: 'plan', label: 'Plan only' },
  ],
  default: 'bypassPermissions',
};

const catalog = {
  ...Catalog.empty,
  harnesses: [
    {
      account: 'claude',
      harness: 'claude' as const,
      name: 'Claude',
      settings: [setting, permissions],
      defaultModel: 'sonnet',
      available: true,
      unavailableReason: null,
    },
    {
      account: 'codex',
      harness: 'codex' as const,
      name: 'Codex',
      settings: [],
      defaultModel: 'gpt',
      available: true,
      unavailableReason: null,
    },
  ],
  models: [
    {
      account: 'claude',
      list: [
        { id: 'opus', name: 'Opus', releaseDate: '2026-05-01' },
        { id: 'sonnet', name: 'Sonnet', releaseDate: null },
      ],
      problem: null,
    },
    {
      account: 'codex',
      list: [{ id: 'gpt', name: 'GPT', releaseDate: null }],
      problem: null,
    },
  ],
};

/** A second Claude login, "Claude Work", beside the Default Accounts. */
const work = {
  ...catalog,
  harnesses: [
    ...catalog.harnesses,
    { ...catalog.harnesses[0]!, account: 'claude-work', name: 'Claude Work' },
  ],
  models: [
    ...catalog.models,
    { ...catalog.models[0]!, account: 'claude-work' },
  ],
};
/** The catalog the page is drawn with, and the account it starts on. */
let shown: typeof catalog = catalog;
let startAs = 'claude';

const Chosen = Schema.Struct({
  account: Schema.String,
  model: Schema.NullOr(Schema.String),
  settings: Schema.Record(Schema.String, Schema.String),
});

const Page = Actor.define('Page', {
  model: Schema.Struct({
    current: Chosen,
    picking: Schema.NullOr(
      Schema.Struct({ how: Picker.How, at: ModelPicker.At }),
    ),
    opened: Schema.Finite,
    pings: Schema.Finite,
  }),
  message: Schema.TaggedUnion({
    Ping: {},
    Open: { how: Picker.How, at: ModelPicker.At },
    Set: { key: Schema.String, value: Schema.String },
    Done: {
      chosen: Schema.NullOr(
        Schema.Struct({
          account: Schema.NullOr(Schema.String),
          model: Schema.NullOr(Schema.String),
          settings: Schema.Record(Schema.String, Schema.String),
        }),
      ),
    },
  }),
});

const PageLive = Page.build({
  init: () => ({
    model: {
      current: { account: startAs, model: null, settings: {} },
      picking: null,
      opened: 0,
      pings: 0,
    },
  }),
  children: {
    models: Actor.child(ModelPicker.Live, {
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) =>
        ModelPicker.opening({
          how: model.picking?.how ?? 'keys',
          at: model.picking?.at ?? 'model',
          started: false,
          catalog: shown,
          current: model.current,
        }),
      props: ({ model }) => ({
        catalog: shown,
        current: model.current,
        alone:
          model.picking?.at === 'agent' || model.picking?.at === 'modelAlone',
      }),
    }),
  },
  provides: (self) =>
    ModelPicker.owner((chosen) => self.send({ _tag: 'Done', chosen })),
  on: {
    Ping: (_, { model }) => ({ model: { ...model, pings: model.pings + 1 } }),
    Open: ({ how, at }, { model }) => ({
      model: { ...model, picking: { how, at }, opened: model.opened + 1 },
    }),
    Set: ({ key, value }, { model }) => ({
      model: {
        ...model,
        current: {
          ...model.current,
          settings: { ...model.current.settings, [key]: value },
        },
      },
    }),
    Done: ({ chosen }, { model }) => ({
      model: {
        ...model,
        picking: null,
        current:
          chosen === null
            ? model.current
            : {
                account: chosen.account ?? model.current.account,
                model: chosen.model,
                settings: { ...model.current.settings, ...chosen.settings },
              },
      },
    }),
  },
});

let page = {
  current: {
    account: '',
    model: null as string | null,
    settings: {} as Readonly<Record<string, string>>,
  },
  pings: 0,
};
let ping = () => {};

const PageView = View.make(PageLive, ({ model, children, send }) => {
  page = { current: model.current, pings: model.pings };
  ping = () => send({ _tag: 'Ping' });
  return (
    <keys.Provider vim>
      <Editor />
      {chip ? (
        <Chip
          catalog={shown}
          current={model.current}
          started={false}
          how={model.picking?.how ?? null}
          onOpen={(at) => send({ _tag: 'Open', how: 'touch', at })}
          onSet={(key, value) => send({ _tag: 'Set', key, value })}
        >
          {children.models && <ModelPicker.View instance={children.models} />}
        </Chip>
      ) : (
        <Triggers
          catalog={shown}
          current={model.current}
          started={false}
          how={model.picking}
          onOpen={(at, how) => send({ _tag: 'Open', how, at })}
        >
          {children.models && <ModelPicker.View instance={children.models} />}
        </Triggers>
      )}
    </keys.Provider>
  );
});

function Editor() {
  const spot = keys.useFocusSpot('content', 'page', { default: true });
  return (
    <keys.Surface id="content">
      <div ref={spot} tabIndex={0} data-testid="editor" />
    </keys.Surface>
  );
}

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const editor = () =>
  document.querySelector<HTMLElement>('[data-testid="editor"]')!;
const search = () => document.querySelector<HTMLInputElement>('[cmdk-input]');
const rows = () =>
  [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].map((item) => ({
    text: item.textContent,
    checked: item.dataset['checked'] === 'true',
    logo: item.querySelector('svg[role="img"]')?.getAttribute('aria-label'),
  }));

const key = async (name: string, init: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        code: name.length === 1 ? `Key${name.toUpperCase()}` : name,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', { key: name, bubbles: true, ...init }),
    );
  });
  await flush();
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(async () => {
  document.documentElement.toggleAttribute('data-keyboard', !chip);
  const App = View.app(PageView, { name: `model-picker-test-${apps++}` });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && page.pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  expect(page.pings).toBeGreaterThan(0);
  await act(async () => editor().focus());
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('ModelPicker', () => {
  it('opens on `m` at the agent, what is in effect checked', async () => {
    await key('m');
    expect(document.activeElement).toBe(search());
    expect(rows()).toEqual([
      { text: 'Default', checked: true, logo: 'Claude' },
      { text: 'Default', checked: false, logo: 'Codex' },
    ]);
  });

  it('goes agent, model, setting, and gives focus back to the editor', async () => {
    await key('m');
    await key('Enter');
    expect(rows()).toEqual([
      { text: 'Opus2026-05', checked: false },
      { text: 'Sonnet', checked: true },
    ]);
    await key('Enter');
    expect(document.querySelector('nav')?.textContent).toBe('ClaudeOpusEffort');
    await key('ArrowDown');
    await key('Enter');
    expect(document.querySelector('nav')?.textContent).toBe(
      'ClaudeOpusHighPermissions',
    );
    await key('Enter', { ctrlKey: true });
    await flush();
    expect(search()).toBeNull();
    expect(page.current).toEqual({
      account: 'claude',
      model: 'opus',
      settings: { effort: 'high', permissionMode: 'bypassPermissions' },
    });
    expect(document.activeElement).toBe(editor());
  });

  it('skips the settings with Mod+Enter on a model', async () => {
    await key('m');
    await key('ArrowDown');
    await key('Enter');
    expect(search()?.placeholder).toBe('Search Codex models');
    await key('Enter', { ctrlKey: true });
    await flush();
    expect(page.current).toEqual({
      account: 'codex',
      model: 'gpt',
      settings: {},
    });
    expect(document.activeElement).toBe(editor());
  });

  it('opens the settings button at the first setting, after the agent and model', async () => {
    const button = document.querySelector<HTMLElement>(
      'button[aria-label^="Settings"]',
    )!;
    await act(async () => button.click());
    await flush();
    expect(document.querySelector('nav')?.textContent).toBe(
      'ClaudeSonnetEffort',
    );
    expect(rows()).toEqual([
      { text: 'Low', checked: true },
      { text: 'High', checked: false },
    ]);
    await key('Backspace');
    expect(search()?.placeholder).toBe('Search effort');
  });

  it('opens on `p` at the permissions alone, and finishes on the choice', async () => {
    await key('p');
    expect(document.querySelector('nav')?.textContent).toBe(
      'ClaudeSonnetPermissions',
    );
    expect(rows()).toEqual([
      { text: 'Bypass permissions', checked: true },
      { text: 'Plan only', checked: false },
    ]);
    await key('ArrowDown');
    await key('Enter');
    await flush();
    expect(search()).toBeNull();
    expect(page.current).toEqual({
      account: 'claude',
      model: 'sonnet',
      settings: { permissionMode: 'plan' },
    });
    expect(document.activeElement).toBe(editor());
  });

  it('opens on `e` at the effort alone, and finishes on the choice', async () => {
    await key('e');
    expect(search()?.placeholder).toBe('Search effort');
    await key('ArrowDown');
    await key('Enter');
    await flush();
    expect(search()).toBeNull();
    expect(page.current.settings).toEqual({ effort: 'high' });
  });
});

describe('ModelPicker, from the model chip on a device with no keyboard', () => {
  beforeAll(() => {
    chip = true;
  });
  afterAll(() => {
    chip = false;
  });
  const drawer = () => document.querySelector('[data-slot="touch-drawer"]');
  const dialog = () =>
    document.querySelector('[data-slot="touch-drawer"] [cmdk-input]');
  const button = (label: RegExp) =>
    [...document.querySelectorAll<HTMLElement>('button')].find((each) =>
      label.test(each.getAttribute('aria-label') ?? each.textContent ?? ''),
    )!;
  const tap = async (target: HTMLElement) => {
    await act(async () => target.click());
    await flush();
  };
  const radios = () =>
    [...document.querySelectorAll<HTMLElement>('[role="radio"]')].map(
      (each) => `${each.textContent}${each.ariaChecked === 'true' ? ' ✓' : ''}`,
    );

  it('says the model and its settings, and opens a Drawer of them', async () => {
    const opener = button(/^Model and settings/);
    expect(opener.textContent).toBe('SonnetLow · Bypass permissions');
    await tap(opener);
    expect(drawer()).not.toBeNull();
    expect(button(/^Agent: Claude$/)).toBeDefined();
    expect(button(/^Model: Sonnet$/)).toBeDefined();
    expect(radios()).toEqual([
      'Low ✓',
      'High',
      'Bypass permissions ✓',
      'Plan only',
    ]);
  });

  it('changes a setting in place, and stays', async () => {
    await tap(button(/^Model and settings/));
    await tap(button(/^High$/));
    await tap(button(/^Plan only$/));
    expect(page.current.settings).toEqual({
      effort: 'high',
      permissionMode: 'plan',
    });
    expect(drawer()).not.toBeNull();
    expect(radios()).toEqual([
      'Low',
      'High ✓',
      'Bypass permissions',
      'Plan only ✓',
    ]);
  });

  it('opens the model in a Sheet from its row, where choosing one finishes', async () => {
    await tap(button(/^Model and settings/));
    await tap(button(/^Model: /));
    expect(dialog()).not.toBeNull();
    expect(rows()).toEqual([
      { text: 'Opus2026-05', checked: false },
      { text: 'Sonnet', checked: true },
    ]);
    await tap(document.querySelector<HTMLElement>('[cmdk-item]')!);
    expect(dialog()).toBeNull();
    expect(page.current).toEqual({
      account: 'claude',
      model: 'opus',
      settings: {},
    });
  });

  it('opens the agent from its row, then its model, which finishes', async () => {
    await tap(button(/^Model and settings/));
    await tap(button(/^Agent: /));
    expect(rows().map(({ logo, text }) => `${logo} ${text}`)).toEqual([
      'Claude Default',
      'Codex Default',
    ]);
    await tap(
      [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].at(-1)!,
    );
    expect(rows()).toEqual([{ text: 'GPT', checked: true }]);
    await tap(document.querySelector<HTMLElement>('[cmdk-item]')!);
    expect(dialog()).toBeNull();
    expect(page.current.account).toBe('codex');
  });
});

describe('ModelPicker, with a Harness Account beside the Default Accounts', () => {
  beforeAll(() => {
    shown = work;
    startAs = 'claude-work';
  });
  afterAll(() => {
    shown = catalog;
    startAs = 'claude';
    chip = false;
  });
  const type = async (text: string) => {
    const input = search()!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
  };
  const trigger = (label: RegExp) =>
    [...document.querySelectorAll<HTMLElement>('button')].find((each) =>
      label.test(each.getAttribute('aria-label') ?? ''),
    )!;

  it("names it by its agent's logo and its own name, and in words Claude-Work", async () => {
    const model = trigger(/^Model: /);
    expect(model.getAttribute('aria-label')).toBe('Model: Claude-Work, Sonnet');
    expect(
      model.querySelector('svg[role="img"]')?.getAttribute('aria-label'),
    ).toBe('Claude');
    expect(model.textContent).toBe('Work ·Sonnet');
    await key('m');
    expect(rows()).toEqual([
      { text: 'Default', checked: false, logo: 'Claude' },
      { text: 'Default', checked: false, logo: 'Codex' },
      { text: 'Work', checked: true, logo: 'Claude' },
    ]);
    await key('Escape');
  });

  it('finds an agent by the name its logo says, and says the account chosen in words', async () => {
    await key('m');
    await type('codex');
    expect(rows().map(({ logo, text }) => `${logo} ${text}`)).toEqual([
      'Codex Default',
    ]);
    await type('');
    await key('ArrowDown');
    await key('ArrowDown');
    await key('Enter');
    expect(
      document.querySelector('nav[aria-label="Chosen so far"]')?.textContent,
    ).toBe('Claude-Work');
    await key('Escape');
    await key('Escape');
  });

  it('says the account on the chip, before its model', async () => {
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    chip = true;
    document.documentElement.toggleAttribute('data-keyboard', false);
    const App = View.app(PageView, { name: `model-picker-test-${apps++}` });
    root = createRoot(document.body.appendChild(document.createElement('div')));
    await act(async () => root!.render(<App />));
    await flush();
    const opener = trigger(/^Model and settings/);
    expect(opener.getAttribute('aria-label')).toBe(
      'Model and settings: Claude-Work, Sonnet · Low · Bypass permissions',
    );
    expect(opener.textContent).toBe('Work·SonnetLow · Bypass permissions');
  });
});
