import * as Data from 'effect/Data';

export type UpdateState = Data.TaggedEnum<{
  Idle: {};
  Checking: {};
  Available: {};
  Applying: {};
  Unsupported: {};
}>;
export const UpdateState = Data.taggedEnum<UpdateState>();

export type InstallState = Data.TaggedEnum<{
  Unsupported: {};
  Available: {};
  ManualIos: {};
  Installed: {};
  Dismissed: {};
}>;
export const InstallState = Data.taggedEnum<InstallState>();

export type DisplayModeValue =
  | 'browser'
  | 'standalone'
  | 'minimal-ui'
  | 'fullscreen'
  | 'window-controls-overlay';
