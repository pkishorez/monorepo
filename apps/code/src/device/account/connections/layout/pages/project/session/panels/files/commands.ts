import { Clock, Effect } from 'effect';
import {
  FILE_TICKET_LIFETIME_MS,
  FilesAddress,
  FilesClient,
  FilesClients,
  type RequestFileError,
} from '@kestack/connect/files';
import type { Embed, Ticket } from './files.ts';

/*
 * What a session's page asks of its Connection's files Plugin: a File
 * Ticket for an embed, kept with the URL a browser opens it at and when
 * it ends by this browser's clock, a ticket's lifetime after the answer
 * came: the Connection's `expiresAt` is by its own clock, which may not
 * agree; or why there is none. A Connection that does not answer in
 * time, or runs another Release of the files Plugin, is said to be out of
 * reach, and asked again later.
 */

/** How long an ask may take before it is given up. */
const PATIENCE = '20 seconds';

/** Said when the files Plugin could not be asked. */
export const UNREACHED = 'Could not reach the files Plugin';

/** Why the files Plugin gave no ticket, as a person reads it. */
export const reasonOf = (error: RequestFileError): string => {
  switch (error._tag) {
    case 'FileMissing':
      return 'Missing';
    case 'NotAFile':
      return 'Not a file';
    case 'UnsupportedFile':
      return error.extension === ''
        ? 'Unsupported: it has no extension'
        : `Unsupported .${error.extension}`;
    case 'FileUnreadable':
      return error.message === ''
        ? 'Unreadable'
        : `Unreadable: ${error.message}`;
  }
};

/** Whether a failure is the files Plugin's answer, not a socket's or the clock's. */
const isRefusal = (error: {
  readonly _tag: string;
}): error is RequestFileError =>
  error._tag === 'FileMissing' ||
  error._tag === 'NotAFile' ||
  error._tag === 'UnsupportedFile' ||
  error._tag === 'FileUnreadable';

/** The answer to an ask: a ticket, or why there is none and when it was said. */
export type Answer =
  | { readonly _tag: 'Given'; readonly ticket: Ticket }
  | { readonly _tag: 'Refused'; readonly reason: string; readonly at: number };

/** A File Ticket for `embed`, over its Connection's own files socket. */
export const requestFile = ({
  connectionId,
  base,
  path,
}: Embed): Effect.Effect<Answer, never, FilesClients | FilesAddress> =>
  FilesClients.on(
    connectionId,
    FilesClient.use((api) => api.requestFile({ base, path })),
  ).pipe(
    Effect.flatMap((ticket) =>
      Effect.zipWith(
        FilesAddress.ticketUrl(connectionId, ticket.url),
        Clock.currentTimeMillis,
        (url, received): Answer => ({
          _tag: 'Given',
          ticket: {
            path: ticket.path,
            name: ticket.name,
            kind: ticket.kind,
            mime: ticket.mime,
            size: ticket.size,
            url,
            expiresAt: received + FILE_TICKET_LIFETIME_MS,
          },
        }),
      ),
    ),
    Effect.timeout(PATIENCE),
    Effect.catch((error) =>
      Effect.map(Clock.currentTimeMillis, (at): Answer => ({
        _tag: 'Refused',
        reason: isRefusal(error) ? reasonOf(error) : UNREACHED,
        at,
      })),
    ),
  );
