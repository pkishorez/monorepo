import type {
  Data,
  Defined,
  IsSingle,
  ModelInit,
  Only,
  Rules,
  Self,
  Workers,
} from './actor/index.ts';

export type {
  ActorType,
  AnyActor,
  BlueprintLevel,
  DefinedOf,
  Self,
  Single,
} from './actor/index.ts';
export type {
  Asked,
  BeforeAfter,
  Change,
  Entry,
  From,
  Instance,
  SavedSnapshot,
  Tried,
  WantedWorker,
  Whole,
} from './snapshot/index.ts';
export type {
  CommandStatus,
  InstanceWork,
  LiveInstance,
  Needs,
  ProvideStatus,
  RuntimeOptions,
  Sent,
  Work,
  WorkerStatus,
  WorkFailure,
} from './runtime/index.ts';
export type { HistoryEntry, SavedHistory } from './history/index.ts';

/*
 * The parts of an Actor written outside its `build`, typed from its Shape
 * alone, `typeof FolderViewerShape`: each is exactly what `build` takes in
 * that place, so every parameter is typed where it is written.
 */

/** What a Shape fixes, by name. */
type Parts<S> =
  S extends Defined<
    any,
    infer Input,
    infer Props,
    infer Model,
    infer State,
    infer Msg,
    infer R,
    infer Emits,
    any
  >
    ? {
        input: Input;
        props: Props;
        model: Model;
        state: State;
        message: Msg;
        requires: R;
        emits: Emits;
      }
    : never;

/** Its `init`: the first Model, and State when it has more than one, from its Input. */
export type InitOf<S> =
  IsSingle<Parts<S>['state']> extends true
    ? (input: Parts<S>['input']) => ModelInit<Parts<S>['model']>
    : (
        input: Parts<S>['input'],
      ) => { readonly state: Parts<S>['state'] } & ModelInit<Parts<S>['model']>;

/** Its Updates, `on`: one per Message it answers at the top of `build`, or in State `T`'s block when given. */
export type UpdatesOf<
  S,
  T extends Parts<S>['state']['_tag'] = Parts<S>['state']['_tag'],
> = Rules<
  Parts<S>['model'],
  Only<Parts<S>['state'], T>,
  Parts<S>['props'],
  Parts<S>['message'],
  Parts<S>['requires'],
  IsSingle<Parts<S>['state']> extends true ? never : Parts<S>['state'],
  Parts<S>['emits']
>;

/** Its Workers by name, at the top of `build`, or in State `T`'s block when given. */
export type WorkersOf<
  S,
  T extends Parts<S>['state']['_tag'] = Parts<S>['state']['_tag'],
> = Workers<
  Parts<S>['model'],
  Only<Parts<S>['state'], T>,
  Parts<S>['message'],
  Parts<S>['requires'],
  Parts<S>['props']
>;

/** What its Workers and Provides hold of an Instance, in State `T` when given. */
export type SelfOf<
  S,
  T extends Parts<S>['state']['_tag'] = Parts<S>['state']['_tag'],
> = Self<
  Parts<S>['model'],
  Only<Parts<S>['state'], T>,
  Parts<S>['message'],
  Parts<S>['props']
>;

/** Its data, in State `T` when given: what a selector reads. */
export type DataOf<
  S,
  T extends Parts<S>['state']['_tag'] = Parts<S>['state']['_tag'],
> = Data<Parts<S>['model'], Only<Parts<S>['state'], T>, Parts<S>['props']>;
