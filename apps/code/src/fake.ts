import { createElement } from 'react';
import { Effect, Layer } from 'effect';
import { browserOver, signIn } from '@kestack/auth-toolkit/fake';
import { agent } from '@kestack/ai-toolkit/harness/fake';
import { speech } from '@kestack/ai-toolkit/speech/fake';
import { inTab, tunnelClients } from '@kestack/connect/browser';
import { computers } from '@kestack/connect/fake';
import { FakeBubble, FakeWorld } from '@kestack/devtools-kabuki/fake';
import { newBuild } from '@kestack/web-platform/pwa/fake';
import { PLUGIN_CODE, Sockets } from './app/account/connection/index.ts';
import { fitted } from './app/account/frame/commands.ts';
import { microphone } from './app/account/frame/header/voice/recorder/fake/index.ts';
import {
  accountsTable,
  preferencesIdb,
  storageIdb,
} from './app/storage/index.ts';

/*
 * Fake mode: Code whole in the tab, with nothing behind it. `start.tsx`
 * imports this lazily, only while developing with `VITE_MODE=fake`
 * (`pnpm dev`), so a production build never carries it.
 *
 * 1. World   the Fakes, each one thing of the outside world a person would
 *            name, run in the tab (`FakeWorld`): who signs in (Sign-in, its
 *            Accounts kept in the device's `accounts` table as the real
 *            ones are), the computers and Connect Cloud (Computers), the
 *            agents and Speech to Text every computer has (Agent,
 *            Speech), this browser's microphones (Microphone) and the
 *            builds a deploy puts out (New build).
 * 2. Middle  Connect Cloud and each computer's code Plugin, the real code,
 *            in the tab over the Fakes (`inTab`), at this Code's Release;
 *            each Connection's socket dialled through the tab's tunnels
 *            (`Sockets` over `tunnelClients`).
 * 3. Root    the root Layer, as `start.tsx`'s real one, but for its edges:
 *            `Accounts` from the Sign-in fake, `CloudClient` and `Sockets`
 *            from the Middle, `Recorder` from the Microphone fake,
 *            `OnOutdated` from the New build fake; `Preferences` and
 *            `Storage` as in real mode, in IndexedDB. Built once, by Start,
 *            for as long as the page: so the World and every in-process
 *            client live as long as it does. Before anything opens a
 *            database, a Start fresh asked by the bubble clears them all.
 * 4. Bubble  `Bubble`, the Fakes' Models and Controls, drawn beside the app.
 *
 * A reload does not yet keep the World: the Fakes start blank, as do
 * Connect Cloud's and the code Plugins' tables, which are in memory, while
 * Code's own IndexedDB keeps what it last saw and prunes it as the blank
 * world answers. Keeping it all is a later step (the plan's task 20).
 */

// 1. World
export const world = FakeWorld.make([
  {
    ...signIn,
    serve: (runtime: Parameters<typeof signIn.serve>[0]) =>
      browserOver(runtime, {
        cache: accountsTable,
        returnTo: new URL('/', window.location.href).href,
      }),
  },
  computers,
  agent,
  speech,
  microphone,
  newBuild,
]);

// 2. Middle
/** Where the code Plugin's Release this Code calls is kept, as Connect Cloud names it. */
const RELEASE_URL = `https://connect.computers.fake/releases/code/${PLUGIN_CODE}.mjs`;

const middle = Sockets.from(tunnelClients).pipe(
  Layer.provideMerge(
    inTab({ wanted: { code: { hash: PLUGIN_CODE, url: RELEASE_URL } } }),
  ),
);

// 3. Root
export const layer = Layer.unwrap(
  Effect.promise(async () => {
    await FakeWorld.beforeStart();
    return Layer.mergeAll(middle, preferencesIdb(fitted), storageIdb).pipe(
      Layer.provideMerge(world.layer),
    );
  }),
);

// 4. Bubble
/** The fake bubble, over the World: draw it once, beside the app. */
export const Bubble = () => createElement(FakeBubble, { world });
