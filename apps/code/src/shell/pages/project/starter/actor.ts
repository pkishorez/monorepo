import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { Kept, Machines } from '../../../../layer/capabilities/index.ts';
import { Replicas } from '@kestack/std-toolkit/replica';
import {
  Catalog,
  SessionArrival,
  SharedCatalog,
} from '../capabilities/index.ts';
import { Draft } from '../draft/index.ts';

/*
 * A new session in a project, wherever it is shown, outside the project's
 * page: its Draft (`draft/`), with the catalog of agents, models and
 * Skills it chooses from, from the project's own Machine's Kit and the
 * project's kept Skills, as the project's page keeps it for its own. The
 * Project Picker shows one in a Drawer once a project is picked on touch.
 */

const Props = Schema.Struct({
  machineId: Schema.String,
  projectId: Schema.String,
  /** Its folder, as the Machine names it. */
  path: Schema.String,
});

const Starter = Actor.define('Starter', {
  requires: [CodeClients, Machines, Kept, Navigation, Replicas],
  props: Props,
  model: Schema.Struct({ catalog: Catalog.Keeper }),
  message: Schema.TaggedUnion(Catalog.messages),
});

/** The catalog, kept for the Machine and project its Props name. */
const catalog = Catalog.keeping((props: Catalog.Where) => props);

export const StarterLive = Actor.build(Starter, {
  init: () => ({ model: { catalog: Catalog.fresh } }),
  provides: (self) =>
    Layer.mergeAll(
      Layer.unwrap(
        Effect.map(self.get, ({ props }) =>
          CodeClients.machine(props.machineId),
        ),
      ),
      Layer.succeed(SharedCatalog, catalog.shares(self)),
      // Its session asked for, its answer lost.
      Layer.unwrap(
        Effect.map(self.get, ({ props }) =>
          SessionArrival.machine(props.machineId),
        ),
      ),
    ),
  workers: catalog.workers,
  children: {
    draft: {
      actor: Draft.actor,
      props: ({ props }) => ({
        machineId: props.machineId,
        projectId: props.projectId,
        to: { _tag: 'NewSession' as const },
      }),
    },
  },
  on: catalog.on,
});
