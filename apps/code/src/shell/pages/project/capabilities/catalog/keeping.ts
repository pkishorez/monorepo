import { Effect, Stream } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import type { Self } from '@kestack/kabuki';
import { askSkills, followKit, savedSkills } from './api.ts';
import {
  Change,
  type Keeper,
  running,
  sameCatalog,
  shared,
  wants,
} from './catalog.ts';
import { changed } from './commands.ts';

/*
 * How an Actor keeps the catalog, the project page or a Starter, for the
 * Machine and project its Props name: the Messages it is sent, the Workers
 * that read it, what each Message makes of it, and what it shares with
 * what is under it. The keeper holds it as `catalog` in its Model.
 */

/** The Machine and project a keeper keeps the catalog of. */
export type Where = { readonly machineId: string; readonly projectId: string };

/** The Messages a keeper is sent. */
export const messages = {
  Catalog: { change: Change },
  CatalogRetryAsked: {},
};

type Holds = { readonly catalog: typeof Keeper.Type };
type Message =
  | { readonly _tag: 'Catalog'; readonly change: typeof Change.Type }
  | { readonly _tag: 'CatalogRetryAsked' };

/** The keeper's Model after a Change, with what it asks. */
const keep = <M extends Holds>(
  model: M,
  change: typeof Change.Type,
  where: Where,
) => {
  const { keeper, command } = changed(model.catalog, change, where);
  return { model: { ...model, catalog: keeper }, command };
};

/** The catalog kept for the Machine and project `where` reads from Props. */
export const keeping = <P>(where: (props: P) => Where) => {
  type Keeping = Self<Holds, unknown, Message, P>;
  return {
    /** The catalog as it shares it, and how it is read again. */
    shares: (self: Keeping) => ({
      changes: self.changes.pipe(
        Stream.map(({ model }) => shared(model.catalog)),
        Stream.changesWith(sameCatalog),
      ),
      retry: self.send({ _tag: 'CatalogRetryAsked' }),
    }),
    workers: {
      kit: {
        run: (self: Keeping) =>
          Effect.flatMap(self.get, ({ props }) =>
            Stream.runForEach(followKit(where(props).machineId), (change) =>
              self.send({ _tag: 'Catalog', change }),
            ),
          ),
      },
      saved: {
        while: ({ model }: { readonly model: Holds }) =>
          !model.catalog.skills.keptRead,
        run: (self: Keeping) =>
          Effect.flatMap(self.get, ({ props }) => {
            const { machineId, projectId } = where(props);
            return savedSkills(machineId, projectId).pipe(
              Effect.flatMap((change) =>
                self.send({ _tag: 'Catalog', change }),
              ),
            );
          }),
      },
      skills: {
        each: ({ model }: { readonly model: Holds }) => wants(model.catalog),
        run: (self: Keeping, since: string) =>
          Effect.gen(function* () {
            const { model, props } = yield* self.get;
            const { machineId, projectId } = where(props);
            const change = yield* CodeClients.on(
              machineId,
              askSkills(
                projectId,
                running(model.catalog.kit.harnesses),
                Number(since),
              ),
            );
            yield* self.send({ _tag: 'Catalog', change });
          }),
      },
    },
    on: {
      Catalog: <M extends Holds>(
        { change }: { readonly change: typeof Change.Type },
        { model, props }: { readonly model: M; readonly props: P },
      ) => keep(model, change, where(props)),
      CatalogRetryAsked: <M extends Holds>(
        _: unknown,
        { model, props }: { readonly model: M; readonly props: P },
      ) => keep(model, { _tag: 'Retry' }, where(props)),
    },
  };
};
