import * as Data from 'effect/Data';

export type UpdateState = Data.TaggedEnum<{
  Idle: {};
  Checking: {};
  Available: {};
  Applying: {};
  Unsupported: {};
}>;
export const UpdateState = Data.taggedEnum<UpdateState>();
