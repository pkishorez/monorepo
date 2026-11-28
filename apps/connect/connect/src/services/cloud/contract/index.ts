import { Context, Data, type Effect } from 'effect';
import type { EnabledPlugins, Report } from '@kestack/connect-cloud/heartbeat';

export type ReportAnswer =
  | { readonly _tag: 'Enabled'; readonly plugins: EnabledPlugins }
  | { readonly _tag: 'Unsent'; readonly problem: string }
  | { readonly _tag: 'SignedOut' }
  | { readonly _tag: 'Removed' }
  | { readonly _tag: 'Outdated'; readonly line: string };

export class CloudUnreachable extends Data.TaggedError('CloudUnreachable')<{
  readonly message: string;
}> {}

export class Cloud extends Context.Service<
  Cloud,
  {
    readonly report: (report: Report) => Effect.Effect<ReportAnswer>;
    readonly remove: (id: string) => Effect.Effect<void, CloudUnreachable>;
  }
>()('Connect/service/Cloud') {}
