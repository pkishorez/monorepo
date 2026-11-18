import { Schema } from 'effect';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';

/*
 * The Connection Status a Heartbeat carries: where a Connection's tunnel
 * stands, SettingUp at some step or Ready at an address, with how its last
 * Tunnel Check went.
 */

/** Whether a Connection could reach itself at its public address: a Tunnel Check. */
export const TunnelCheck = ESchema.make('TunnelCheck', {
  ok: Schema.Boolean,
  /** When it was checked, epoch ms. */
  at: Schema.Finite,
  /** Why it failed, when it did. */
  problem: Schema.NullOr(Schema.String),
}).build();
export type TunnelCheck = typeof TunnelCheck.Type;

/**
 * One case of a union, tagged by `_tag`. An ESchema stores no constructor
 * default, so the tag is a plain literal, not `Schema.tag`.
 */
const tagged = <const Tag extends string, Fields extends Schema.Struct.Fields>(
  tag: Tag,
  fields: Fields,
) => Schema.Struct({ _tag: Schema.Literal(tag), ...fields });

/** A non-empty string of at most `max` characters. */
const Bounded = (max: number) =>
  Schema.NonEmptyString.check(Schema.isMaxLength(max));

/** A Connection's public address, `https://…` alone. */
const Address = Bounded(256).check(Schema.isPattern(/^https:\/\/[^/?#\s]+/));

/** How far a tunnel being set up has come. */
export const SetupStep = Schema.Union([
  /** cloudflared is downloading: for how long, in ms, and how much has arrived, in bytes. */
  tagged('Downloading', { elapsed: Schema.Finite, received: Schema.Finite }),
  /** cloudflared is starting and connecting to Cloudflare. */
  tagged('Opening', {}),
  /** The tunnel could not open; another is tried shortly. */
  tagged('Failed', { at: Schema.Finite, problem: Schema.String }),
]);
export type SetupStep = typeof SetupStep.Type;

/** What the last Tunnel Check found at a tunnel's address. */
export const CheckResult = Schema.Union([
  /** None has run yet. */
  tagged('Unchecked', {}),
  /** It reached the address. */
  tagged('Reachable', { at: Schema.Finite }),
  /** It did not reach the address. */
  tagged('Unreachable', { at: Schema.Finite, problem: Schema.String }),
]);
export type CheckResult = typeof CheckResult.Type;

/**
 * Where a Connection's tunnel stands, as its last Heartbeat said: the Tunnel's
 * own State, SettingUp at some step or Ready at an address. An App keeps these
 * on its device, so v1, which had one flat case for each, still reads.
 */
export const ConnectionStatus = ValueESchema.make(
  'ConnectionStatus',
  Schema.Union([
    /** Downloading cloudflared, once per computer. */
    tagged('Installing', {}),
    /** cloudflared is starting and connecting to Cloudflare. */
    tagged('Opening', {}),
    /** The tunnel could not open; another is tried shortly. */
    tagged('OpenFailed', { at: Schema.Finite, problem: Schema.String }),
    /** Up at `url`, not checked yet. */
    tagged('Unchecked', { url: Address }),
    /** Up at `url`, and the last Tunnel Check reached it. */
    tagged('Reachable', { url: Address, at: Schema.Finite }),
    /** Up at `url`, but the last Tunnel Check did not reach it. */
    tagged('Unreachable', {
      url: Address,
      at: Schema.Finite,
      problem: Schema.String,
    }),
  ]),
)
  .evolve(
    'v2',
    Schema.Union([
      /** On its way, or failed to open and about to try again. */
      tagged('SettingUp', { step: SetupStep }),
      /** Up at `url`. */
      tagged('Ready', { url: Address, check: CheckResult }),
    ]),
    (v1) => {
      switch (v1._tag) {
        case 'Installing':
          return {
            _tag: 'SettingUp',
            step: { _tag: 'Downloading', elapsed: 0, received: 0 },
          } as const;
        case 'Opening':
          return { _tag: 'SettingUp', step: { _tag: 'Opening' } } as const;
        case 'OpenFailed':
          return {
            _tag: 'SettingUp',
            step: { _tag: 'Failed', at: v1.at, problem: v1.problem },
          } as const;
        case 'Unchecked':
          return {
            _tag: 'Ready',
            url: v1.url,
            check: { _tag: 'Unchecked' },
          } as const;
        case 'Reachable':
          return {
            _tag: 'Ready',
            url: v1.url,
            check: { _tag: 'Reachable', at: v1.at },
          } as const;
        case 'Unreachable':
          return {
            _tag: 'Ready',
            url: v1.url,
            check: { _tag: 'Unreachable', at: v1.at, problem: v1.problem },
          } as const;
      }
    },
  )
  .build();
export type ConnectionStatus = typeof ConnectionStatus.Type;

/** The address a status is up at; null while there is none. */
export const addressOf = (status: ConnectionStatus) =>
  status._tag === 'Ready' ? status.url : null;
