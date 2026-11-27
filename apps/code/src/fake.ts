import { Effect, Layer } from 'effect';
import { signIn } from '@kestack/auth-toolkit/fake';
import { agent } from '@kestack/ai-toolkit/harness/fake';
import { speech } from '@kestack/ai-toolkit/speech/fake';
import { inTab, type Tables, tunnelClients } from '@kestack/connect/browser';
import { computers } from '@kestack/connect/fake';
import { FakeWorld } from '@kestack/kabuki/fake';
import { IDB } from '@kestack/std-toolkit/db/idb';
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
 *            name, together in one FakeWorld (`world`): who signs in
 *            (Sign-in, its Accounts remembered in the device's `accounts`
 *            table as the real ones are), the computers (Computers), the
 *            agents and Speech to Text every computer has (Agent, Speech),
 *            this browser's microphones (Microphone) and the builds a
 *            deploy puts out (New build). `world.fakes` shows each Fake's
 *            state, and `world.control` runs its controls, for DevTools.
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
 *            client live as long as it does.
 *
 * The World keeps nothing: each page load starts every Fake from its
 * start, nobody signed in and no computer. What is kept is kept as
 * before: the Middle's tables in IndexedDB (`code:fake-middle`), and
 * Code's own databases as in real mode.
 */

// 1. World
export const world = FakeWorld.make([
  signIn({ cache: accountsTable }),
  computers,
  agent(),
  speech,
  microphone,
  newBuild,
]);

// 2. Middle
/** Where the code Plugin's Release this Code calls is kept, as Connect Cloud names it. */
const RELEASE_URL = `https://connect.computers.fake/releases/code/${PLUGIN_CODE}.mjs`;

/** Where the Middle keeps its tables: one store per place, Connect Cloud's and each code Plugin's. */
const MIDDLE = 'code:fake-middle';

/**
 * Every table of the Middle in one IndexedDB database, each its own store
 * named by its place (`connect-cloud`, `code-plugin <id>`). Disposable: a
 * table whose shape changes starts empty rather than refuse to open.
 */
const tables: Tables = (table, place) =>
  Layer.unwrap(
    Effect.sync(
      () =>
        IDB.make(table, {
          database: IDB.database({ databaseName: MIDDLE }),
          storeName: place,
          mode: 'disposable',
        }).layer,
    ),
  );

const middle = Sockets.from(tunnelClients).pipe(
  Layer.provideMerge(
    inTab({
      wanted: { code: { hash: PLUGIN_CODE, url: RELEASE_URL } },
      tables,
    }),
  ),
);

// 3. Root
export const layer = Layer.mergeAll(
  middle,
  preferencesIdb(fitted),
  storageIdb,
).pipe(Layer.provideMerge(world.layer));
