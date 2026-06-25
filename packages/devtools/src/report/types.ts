import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { DevtoolsRpc } from '../rpc/index.js';

type DevtoolsRpcs = RpcGroup.Rpcs<typeof DevtoolsRpc>;

type RpcSuccess<Tag extends string> = Rpc.Success<
  Rpc.ExtractTag<DevtoolsRpcs, Tag>
>;

/** The `RunDepcruise` success payload (discriminated availability union). */
export type RunDepcruiseResult = RpcSuccess<'RunDepcruise'>;

/**
 * One self-contained DevTools report: a per-tool slice for each supported tool,
 * each a discriminated `{ available }` union so partial packages stay valid.
 */
export interface DevtoolsReport {
  readonly depcruise: RunDepcruiseResult;
}
