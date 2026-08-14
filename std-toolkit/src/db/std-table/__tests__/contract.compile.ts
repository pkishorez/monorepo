import { Effect } from 'effect';
import {
  contractLayer,
  StdTableService,
  type StdTableContract,
} from '../contract/index.js';

declare const contract: StdTableContract;

const people = StdTableService('people');
const orders = StdTableService('orders');
const peopleLayer = contractLayer('people', contract);
const ordersLayer = contractLayer('orders', contract);

const requiresPeople: Effect.Effect<
  StdTableContract,
  never,
  StdTableService<'people'>
> = people.pipe(Effect.map(({ contract: service }) => service));

const provided = requiresPeople.pipe(Effect.provide(peopleLayer));
const hasNoRequirement: Effect.Effect<StdTableContract> = provided;

const wronglyProvided = requiresPeople.pipe(Effect.provide(ordersLayer));
// @ts-expect-error An orders layer leaves the people Table requirement unsatisfied.
const unrelatedLayerCannotSatisfy: Effect.Effect<StdTableContract> =
  wronglyProvided;

// @ts-expect-error The unprovided Table remains visible in the environment.
const missingLayer: Effect.Effect<StdTableContract> = requiresPeople;

// @ts-expect-error Logical Table service identities remain distinct.
const wrongService: typeof people = orders;

void hasNoRequirement;
void unrelatedLayerCannotSatisfy;
void missingLayer;
void wrongService;
