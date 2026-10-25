import { Effect, Schema } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Command } from '@kestack/kabuki';
import {
  type Kept,
  type Place,
  type SavedDraft,
  SavedDrafts,
  type Written,
} from '../../../../layer/capabilities/index.ts';
import { DraftMode, type Mode } from './mode/index.ts';

/*
 * The Draft as a Saved Draft, and back. Each part is kept by its owner
 * into the one Saved Draft of its place: the Draft its mode open, files
 * and picks; each Draft Mode its own text, through the Draft. One with
 * nothing in it is no Saved Draft.
 *
 * 1. Where  the Account the Draft opened under, and its place: every
 *           read and write is theirs, even as the Draft goes after
 *           another Account is switched to.
 * 2. Read   once, before the Draft is drawn: each mode starts from its
 *           text, and a Message refused after the Draft had gone comes
 *           back into the Message.
 * 3. Keep   each part as its owner last had it; a write stamped older
 *           than one this tab already made of that part is dropped.
 * 4. Send   a Message sent is held until the Machine answers, even past
 *           the Draft: taken, it goes, and the whole Saved Draft with it
 *           when nothing was written since; refused, it is marked, to
 *           come back.
 * 5. Start  a new session started forgets its Project's Saved Draft,
 *           picks and all.
 */

// 1. Where
export const Where = Schema.Struct({
  accountId: Schema.String,
  machineId: Schema.String,
  projectId: Schema.String,
  sessionId: Schema.NullOr(Schema.String),
});
export type Where = typeof Where.Type;

const placeOf = ({ machineId, projectId, sessionId }: Where): Place => ({
  machineId,
  projectId,
  sessionId,
});

/** What the Draft keeps of itself: the mode open, the Message's files and what was picked. */
export interface Parts {
  readonly mode: Mode;
  readonly attachments: SavedDraft['attachments'];
  readonly chosen: SavedDraft['chosen'];
}

const NOTHING: SavedDraft = {
  mode: 'Message',
  written: {},
  attachments: [],
  chosen: { account: null, model: null, settings: {} },
  unsent: [],
};

const isEmpty = ({ written, attachments, chosen, unsent }: SavedDraft) =>
  Object.values(written).every(({ text }) => text === '') &&
  attachments.length === 0 &&
  chosen.account === null &&
  chosen.model === null &&
  Object.keys(chosen.settings).length === 0 &&
  unsent.length === 0;

/** Changes the place's Saved Draft; one left with nothing in it is forgotten. */
const write = (
  where: Where,
  change: (kept: Kept | null) => SavedDraft | null,
) =>
  Effect.flatMap(SavedDrafts, (saved) =>
    saved.write(where.accountId, placeOf(where), (kept) => {
      const draft = change(kept);
      return draft === null || draft === kept?.draft || !isEmpty(draft)
        ? draft
        : null;
    }),
  );

// 2. Read

/** The Account signed in now, for the Draft to keep under from then on. */
export const signedIn = Effect.flatMap(Accounts, ({ current }) =>
  Effect.map(current, (state) =>
    state._tag === 'SignedIn' ? state.active.id : null,
  ),
);

export const read = (where: Where) =>
  Effect.flatMap(SavedDrafts, (saved) =>
    saved.read(where.accountId, placeOf(where)),
  );

/**
 * A Saved Draft as the Draft takes it back: a mode it no longer has is
 * the Message, and each Message refused comes back before the text kept.
 */
export const restoredOf = (
  { mode, written, attachments, chosen, unsent }: SavedDraft,
  modes: ReadonlyArray<Mode>,
) => {
  const refused = unsent.filter((each) => each.refused !== null);
  const writtenIn = (each: Mode): Written => {
    const kept = written[each] ?? DraftMode.blank;
    const end = kept.text.length;
    return {
      text: kept.text,
      anchor: Math.min(kept.anchor, end),
      head: Math.min(kept.head, end),
    };
  };
  const message = writtenIn('Message');
  const back = refused.map(({ text }) => text).filter((text) => text !== '');
  const open: Mode = mode === 'SideQuestion' ? 'SideQuestion' : 'Message';
  return {
    parts: {
      mode: modes.includes(open) ? open : 'Message',
      attachments: [
        ...refused.flatMap((each) => each.attachments),
        ...attachments,
      ],
      chosen,
    } satisfies Parts,
    opening: {
      Message:
        back.length === 0
          ? message
          : DraftMode.writtenOf(
              [...back, ...(message.text === '' ? [] : [message.text])].join(
                '\n\n',
              ),
            ),
      SideQuestion: writtenIn('SideQuestion'),
    },
    /** Why the last Message refused was, and which ones came back. */
    refused: refused.at(-1)?.refused ?? null,
    back: refused.map(({ key }) => key),
  };
};

// 3. Keep

/** What the Draft's Keep Workers read of it. */
interface Keeping extends Parts {
  readonly restored: boolean;
  /** Null with nobody signed in as it opened: nothing is kept. */
  readonly where: Where | null;
  readonly starting: boolean;
  readonly changes: number;
  readonly kept: number;
}

/** Whether the Draft keeps anything now: read back, under an Account, and no new session starting. */
export const keeps = (model: Keeping) =>
  model.restored && model.where !== null && !model.starting;

/**
 * The Draft's Keep Workers: `restore`, until its Saved Draft is read
 * back, which fixes its Account; `save` and `flush`, of its own parts.
 */
export const workers = <P>(placeOf: (props: P) => Place) => {
  const { save, flush } = DraftMode.keeping(
    ({ model }: { readonly model: Keeping }) =>
      keeps(model) && model.changes !== model.kept,
    ({ model }, at) =>
      model.where === null
        ? Effect.void
        : Effect.asVoid(
            keepParts(model.where, at, {
              mode: model.mode,
              attachments: model.attachments,
              chosen: model.chosen,
            }),
          ),
  );
  return {
    restore: {
      while: ({ model }: { readonly model: Keeping }) => !model.restored,
      run: (self: {
        readonly get: Effect.Effect<{ readonly props: P }>;
        readonly send: (message: {
          readonly _tag: 'Restored';
          readonly where: Where | null;
          readonly draft: SavedDraft | null;
        }) => Effect.Effect<void>;
      }) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const accountId = yield* signedIn;
          const where =
            accountId === null ? null : { accountId, ...placeOf(props) };
          const kept = where === null ? null : yield* read(where);
          yield* self.send({
            _tag: 'Restored',
            where,
            draft: kept?.draft ?? null,
          });
        }),
    },
    save,
    flush,
  };
};

/** The last stamp written of each part of each place, in this tab. */
const stamps = new Map<string, number>();

/** Merges a part in, unless a later write of it was already made. */
const keepPart = (
  where: Where,
  part: string,
  at: number,
  merge: (draft: SavedDraft) => SavedDraft,
) => {
  const key = JSON.stringify([where, part]);
  return write(where, (kept) => {
    if ((stamps.get(key) ?? 0) > at) return kept?.draft ?? null;
    stamps.set(key, at);
    return merge(kept?.draft ?? NOTHING);
  });
};

export const keepParts = (where: Where, at: number, parts: Parts) =>
  keepPart(where, 'Draft', at, (draft) => ({ ...draft, ...parts }));

export const keepWritten = (
  where: Where,
  at: number,
  mode: Mode,
  written: Written,
) =>
  keepPart(where, mode, at, (draft) => ({
    ...draft,
    written: { ...draft.written, [mode]: written },
  }));

// 4. Send

/** Holds a Message sent, its text and files out of the Draft kept; the revision it was held at. */
export const hold = (
  where: Where,
  unsent: Pick<SavedDraft['unsent'][number], 'key' | 'text' | 'attachments'>,
) =>
  write(where, (kept) => {
    const draft = kept?.draft ?? NOTHING;
    return {
      ...draft,
      written: { ...draft.written, Message: DraftMode.blank },
      attachments: [],
      unsent: [...draft.unsent, { ...unsent, refused: null }],
    };
  });

/** Taken: the Message goes, and the whole Saved Draft when nothing was written since it was held. */
export const taken = (where: Where, key: string, held: number | null) =>
  write(where, (kept) =>
    kept === null || kept.revision === held
      ? null
      : {
          ...kept.draft,
          unsent: kept.draft.unsent.filter((each) => each.key !== key),
        },
  );

/** Refused: the Message stays, marked with why, to come back. */
export const refused = (where: Where, key: string, reason: string) =>
  write(where, (kept) =>
    kept === null
      ? null
      : {
          ...kept.draft,
          unsent: kept.draft.unsent.map((each) =>
            each.key === key ? { ...each, refused: reason } : each,
          ),
        },
  );

/** Forgets the Messages that came back, as the Draft holds them again. */
export const forgetUnsent = Command.make('ForgetUnsent', {
  args: Schema.Struct({ where: Where, keys: Schema.Array(Schema.String) }),
  run: ({ where, keys }) =>
    Effect.asVoid(
      write(where, (kept) =>
        kept === null
          ? null
          : {
              ...kept.draft,
              unsent: kept.draft.unsent.filter(
                (each) => !keys.includes(each.key),
              ),
            },
      ),
    ),
});

// 5. Start

/** Forgets the place's Saved Draft, as once its new session started. */
export const forget = Command.make('ForgetSavedDraft', {
  args: Schema.Struct({ where: Where }),
  run: ({ where }) => Effect.asVoid(write(where, () => null)),
});
