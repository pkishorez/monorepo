import { randomBytes } from 'node:crypto';
import { Clock, Context, Duration, Effect, Layer, Schedule } from 'effect';
import {
  FILE_TICKET_LIFETIME_MS,
  type FileKind,
} from '../api/contract/index.js';

/*
 * The File Tickets the Plugin has given, kept in memory alone, so a Plugin
 * that stops ends every one. Each is a random 256-bit token, base64url,
 * naming the file as it was when given, its device and inode with it, and
 * ends an hour after it was given however much it is used. One that has
 * ended is gone as it is asked for, and every few minutes for as long as
 * the Plugin runs. Time is the Clock's, so a test moves it.
 */

/** The file a File Ticket names, as it was when given. */
export interface TicketFile {
  /** The file, absolute, its symlinks resolved. */
  readonly realPath: string;
  readonly dev: number;
  readonly ino: number;
  /** Its name, as the ticket's URL ends with it. */
  readonly name: string;
  readonly kind: FileKind;
  readonly mime: string;
}

/** A File Ticket: the file it names and when it ends, in epoch milliseconds. */
export interface Ticket extends TicketFile {
  readonly expiresAt: number;
}

/** How often tickets that have ended are swept away. */
const SWEEP_EVERY = Duration.minutes(5);

export class Tickets extends Context.Service<
  Tickets,
  {
    /** A new ticket to `file`: its token, and when it ends. */
    readonly give: (
      file: TicketFile,
    ) => Effect.Effect<{ readonly token: string; readonly expiresAt: number }>;
    /** The ticket `token` names while it lasts; undefined when there is none, or it has ended. */
    readonly take: (token: string) => Effect.Effect<Ticket | undefined>;
    /** How many tickets are kept, ended or not. */
    readonly size: Effect.Effect<number>;
  }
>()('@kestack/connect/files/Tickets') {
  /** The tickets, swept for as long as the Layer lasts. */
  static readonly layer = Layer.effect(
    Tickets,
    Effect.gen(function* () {
      const clock = yield* Clock.Clock;
      const kept = new Map<string, Ticket>();
      const sweep = Effect.sync(() => {
        const now = clock.currentTimeMillisUnsafe();
        for (const [token, ticket] of kept)
          if (ticket.expiresAt <= now) kept.delete(token);
      });
      yield* Effect.forkScoped(
        sweep.pipe(Effect.repeat(Schedule.spaced(SWEEP_EVERY))),
      );
      return {
        give: (file) =>
          Effect.sync(() => {
            const token = randomBytes(32).toString('base64url');
            const expiresAt =
              clock.currentTimeMillisUnsafe() + FILE_TICKET_LIFETIME_MS;
            kept.set(token, { ...file, expiresAt });
            return { token, expiresAt };
          }),
        take: (token) =>
          Effect.sync(() => {
            const ticket = kept.get(token);
            if (ticket === undefined) return undefined;
            if (ticket.expiresAt > clock.currentTimeMillisUnsafe())
              return ticket;
            kept.delete(token);
            return undefined;
          }),
        size: Effect.sync(() => kept.size),
      };
    }),
  );
}
