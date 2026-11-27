import type { Address } from '../../snapshot/index.ts';

/*
 * The Work report: what the running app is doing, read from the Runtime
 * alone. None of it is in a Snapshot or a History, so a past Step has none.
 */

/** What a Worker is doing, live. */
export interface WorkerStatus {
  readonly name: string;
  /** The key it runs for; `''` for the one Worker of a kind other than `each`. */
  readonly key: string;
  /** `waiting` for the Capabilities above it, then `running`, until it has `finished` or `failed`. */
  readonly status: 'waiting' | 'running' | 'finished' | 'failed';
  /** How it failed, once it has. Being stopped is not failing. */
  readonly failure?: string;
  /** The app's Time it started running; waiting, the Time it was asked for. */
  readonly since: number;
}

/** A Command still running, from the Time its Update asked for it. */
export interface CommandStatus {
  readonly name: string;
  readonly args: unknown;
  readonly since: number;
}

/** What an Instance Provides, or the app's Layer: `building`, then `built` or `failed`. */
export interface ProvideStatus {
  /** The State it is written in; none for one written at the Instance's top. */
  readonly state?: string;
  readonly status: 'building' | 'built' | 'failed';
  readonly failure?: string;
}

/** What one live Instance is doing. */
export interface InstanceWork {
  readonly workers: ReadonlyArray<WorkerStatus>;
  readonly commands: ReadonlyArray<CommandStatus>;
  /** Its Provides: the one at its top, then its current State's, those it has. */
  readonly provides: ReadonlyArray<ProvideStatus>;
}

/** A failure of a Worker, a Command, a Provide or the app's Layer, kept after its Instance stops. */
export interface WorkFailure {
  readonly address: Address;
  readonly kind: 'worker' | 'command' | 'provides' | 'layer';
  /** The Worker's or Command's name; for a Provide, the State it is written in, `''` at the top; `''` for the Layer. */
  readonly name: string;
  /** The key of an `each` Worker. */
  readonly key?: string;
  readonly failure: string;
  /** The app's Time it failed. */
  readonly at: number;
}

/** What the running app is doing now. */
export interface Work {
  /** Every live Instance, by Address: none while the Runtime is stopped. */
  readonly instances: Readonly<Record<string, InstanceWork>>;
  /** The app's Layer, once the Runtime has run. */
  readonly layer?: ProvideStatus;
  /** The latest failures, oldest first. */
  readonly failures: ReadonlyArray<WorkFailure>;
  /**
   * No Command running, no Provide or Layer building and no Worker waiting.
   * An empty Mailbox is not the test: it drains before a Send returns, and
   * a Worker Sends whenever it likes.
   */
  readonly settled: boolean;
}
