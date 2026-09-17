import { Cause, Clock, Effect, Exit, Option } from 'effect';
import type {
  ActivationOutcome as ActivationOutcomeKind,
  AttributeValue,
  Entry,
  Severity,
} from '../journal/index.js';
import { FlowTelemetry } from '../telemetry/index.js';

export interface EntryOptions {
  readonly attributes?: Readonly<Record<string, unknown>> | undefined;
  readonly severity?: Severity | undefined;
}

/** Why an Activation ended. `failed` cannot be constructed without a cause. */
export type ActivationOutcome =
  | { readonly kind: 'completed' }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'interrupted'; readonly reason?: string };

/** Constructors for Activation Outcomes. */
export const Activation = {
  completed: (): ActivationOutcome => ({ kind: 'completed' }),
  failed: (error: unknown): ActivationOutcome => ({ error, kind: 'failed' }),
  interrupted: (reason?: string): ActivationOutcome => ({
    kind: 'interrupted',
    ...(reason === undefined ? {} : { reason }),
  }),
  /** Folds an Effect Exit into an Outcome; defects count as failures. */
  fromExit: (exit: Exit.Exit<unknown, unknown>): ActivationOutcome => {
    if (Exit.isSuccess(exit)) return { kind: 'completed' };
    if (Cause.hasInterruptsOnly(exit.cause)) return { kind: 'interrupted' };
    return { kind: 'failed', error: Cause.squash(exit.cause) };
  },
} as const;

/** Identifies one sent Message so a Reply can point back at it. */
export interface MessageToken {
  readonly id: string;
  readonly from: string;
  readonly to: string;
}

/** A started Activation. Ending it is the only thing you can do with it. */
export interface ActivationRef {
  readonly id: string;
  readonly end: (
    outcome: ActivationOutcome,
    options?: EntryOptions,
  ) => Effect.Effect<void>;
}

export interface Participant {
  readonly flowId: string;
  readonly name: string;
  /** Records something that happened inside this Participant. */
  readonly event: (name: string, options?: EntryOptions) => Effect.Effect<void>;
  /** Records a Message to another Participant, by value or by name. */
  readonly send: (
    to: Participant | string,
    name: string,
    options?: EntryOptions,
  ) => Effect.Effect<MessageToken>;
  /** Records the Reply that closes a Message's round trip. */
  readonly reply: (
    token: MessageToken,
    name: string,
    options?: EntryOptions,
  ) => Effect.Effect<MessageToken>;
  readonly activation: {
    /** Opens an Activation that outlives the current fiber; end it yourself. */
    readonly start: (
      name: string,
      options?: EntryOptions,
    ) => Effect.Effect<ActivationRef>;
  };
  /** Runs an effect inside one Activation whose Outcome is its Exit. */
  readonly activated: (
    name: string,
    options?: EntryOptions,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  /** States that this Participant has suspended its own work for a reason. */
  readonly wait: (
    reason: string,
    options?: EntryOptions,
  ) => Effect.Effect<void>;
  /** States that this Participant continued after its own Wait. */
  readonly resume: (
    name?: string,
    options?: EntryOptions,
  ) => Effect.Effect<void>;
  /** Runs an effect between a Wait and a Resume. */
  readonly waiting: (
    reason: string,
    options?: EntryOptions,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  /** Records a condition this Participant evaluated. Shown, never enforced. */
  readonly check: (
    name: string,
    passed: boolean,
    options?: EntryOptions,
  ) => Effect.Effect<void>;
  /** Hints that whoever writes it believes the Flow is finished. */
  readonly close: (
    name?: string,
    options?: EntryOptions,
  ) => Effect.Effect<void>;
}

export interface Flow {
  readonly id: string;
  /** The Participant lane named `name`; the same name is always the same lane. */
  readonly participant: (name: string) => Participant;
}

export interface FlowOptions {
  readonly id: string;
}

const attributeValue = (value: unknown): AttributeValue => {
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined)
      return JSON.parse(serialized) as AttributeValue;
  } catch {}
  return String(value);
};

const normalizeAttributes = (
  attributes: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, AttributeValue>> | undefined =>
  attributes === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(attributes).map(([key, value]) => [
          key,
          attributeValue(value),
        ]),
      );

const outcomeAttributes = (outcome: ActivationOutcome) =>
  outcome.kind === 'failed'
    ? { error: String(outcome.error) }
    : outcome.kind === 'interrupted' && outcome.reason !== undefined
      ? { reason: outcome.reason }
      : {};

type EntryBase = Extract<Entry, { kind: 'event' }>;

const makeParticipant = (flowId: string, name: string): Participant => {
  const write = <K extends Entry>(
    entryName: string,
    options: EntryOptions | undefined,
    defaultSeverity: Severity,
    finish: (base: Omit<EntryBase, 'kind'>, nextId: () => string) => K,
  ): Effect.Effect<K> =>
    Effect.gen(function* () {
      const telemetry = yield* FlowTelemetry;
      const timestamp = yield* Clock.currentTimeMillis;
      const span = yield* Effect.option(Effect.currentSpan);
      const attributes = normalizeAttributes(options?.attributes);
      const base: Omit<EntryBase, 'kind'> = {
        id: telemetry.nextId(),
        flowId,
        participantName: name,
        name: entryName,
        sequence: telemetry.nextSequence(),
        timestamp,
        severity: options?.severity ?? defaultSeverity,
        ...(telemetry.origin === undefined ? {} : { origin: telemetry.origin }),
        ...(attributes === undefined ? {} : { attributes }),
        ...Option.match(span, {
          onNone: () => ({}),
          onSome: (current) => ({
            traceId: current.traceId,
            spanId: current.spanId,
          }),
        }),
      };
      const entry = finish(base, telemetry.nextId);
      telemetry.write(entry);
      return entry;
    });

  const endActivation =
    (activationId: string) =>
    (outcome: ActivationOutcome, options?: EntryOptions) =>
      write(
        `Activation ${outcome.kind}`,
        {
          ...options,
          attributes: { ...outcomeAttributes(outcome), ...options?.attributes },
        },
        outcome.kind === 'failed' ? 'error' : 'info',
        (base) => ({
          kind: 'activation-end' as const,
          ...base,
          activationId,
          outcome: outcome.kind,
        }),
      ).pipe(Effect.asVoid);

  const startActivation = (entryName: string, options?: EntryOptions) =>
    write(entryName, options, 'info', (base, nextId) => ({
      kind: 'activation-start' as const,
      ...base,
      activationId: nextId(),
    })).pipe(
      Effect.map((entry): ActivationRef => ({
        id: entry.activationId,
        end: endActivation(entry.activationId),
      })),
    );

  const wait = (reason: string, options?: EntryOptions) =>
    write(reason, options, 'info', (base) => ({
      kind: 'wait' as const,
      ...base,
    })).pipe(Effect.asVoid);

  const resume = (entryName = 'Resumed', options?: EntryOptions) =>
    write(entryName, options, 'info', (base) => ({
      kind: 'resume' as const,
      ...base,
    })).pipe(Effect.asVoid);

  return {
    flowId,
    name,
    event: (entryName, options) =>
      write(entryName, options, 'info', (base) => ({
        kind: 'event' as const,
        ...base,
      })).pipe(Effect.asVoid),
    send: (to, entryName, options) => {
      const destination = typeof to === 'string' ? to : to.name;
      return write(entryName, options, 'info', (base, nextId) => ({
        kind: 'message' as const,
        ...base,
        messageId: nextId(),
        destination,
      })).pipe(
        Effect.map((entry): MessageToken => ({
          id: entry.messageId,
          from: name,
          to: destination,
        })),
      );
    },
    reply: (token, entryName, options) =>
      write(entryName, options, 'info', (base, nextId) => ({
        kind: 'message' as const,
        ...base,
        messageId: nextId(),
        destination: token.from,
        replyTo: token.id,
      })).pipe(
        Effect.map((entry): MessageToken => ({
          id: entry.messageId,
          from: name,
          to: token.from,
        })),
      ),
    activation: { start: startActivation },
    activated: (entryName, options) => (effect) =>
      Effect.uninterruptibleMask((restore) =>
        startActivation(entryName, options).pipe(
          Effect.flatMap((activation) =>
            restore(effect).pipe(
              Effect.onExit((exit) =>
                activation.end(Activation.fromExit(exit)),
              ),
            ),
          ),
        ),
      ),
    wait,
    resume,
    waiting: (reason, options) => (effect) =>
      Effect.uninterruptibleMask((restore) =>
        wait(reason, options).pipe(
          Effect.andThen(restore(effect)),
          Effect.onExit(() => resume()),
        ),
      ),
    check: (entryName, passed, options) =>
      write(entryName, options, passed ? 'info' : 'warning', (base) => ({
        kind: 'check' as const,
        ...base,
        passed,
      })).pipe(Effect.asVoid),
    close: (entryName = 'Closed', options) =>
      write(entryName, options, 'info', (base) => ({
        kind: 'close' as const,
        ...base,
      })).pipe(Effect.asVoid),
  };
};

/**
 * Creates a Flow. A Flow is identified only by its id: every process that
 * calls `Flow.make` with the same id writes the same Journal, so the call is
 * idempotent by construction and needs no registry.
 */
export const make = (options: FlowOptions): Flow => {
  if (options.id.length === 0) throw new Error('Flow id cannot be empty.');
  const participants = new Map<string, Participant>();
  return {
    id: options.id,
    participant: (name) => {
      if (name.length === 0) {
        throw new Error('Participant name cannot be empty.');
      }
      const existing = participants.get(name);
      if (existing) return existing;
      const created = makeParticipant(options.id, name);
      participants.set(name, created);
      return created;
    },
  };
};

export type { ActivationOutcomeKind };
