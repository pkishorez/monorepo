import type { Row } from './rows/index.ts';
import { isSaid, type SaidRow } from './answer/said.tsx';
import type { Spend } from './answer/footer.tsx';

/*
 * Rows as a conversation reads them: in turns, each your words, what the
 * agent did, and how it ended; and each turn cut into what the agent said,
 * the runs of work between, and what you added while it worked, where you
 * sent it.
 */

type TurnRow = Extract<Row, { readonly kind: 'turn' }>;
type EndedRow = Extract<Row, { readonly kind: 'ended' }>;

export type Turn = {
  readonly id: string;
  readonly asks: ReadonlyArray<TurnRow>;
  readonly rows: ReadonlyArray<Row>;
  readonly ended: EndedRow | null;
};

export const turnsOf = (rows: ReadonlyArray<Row>): ReadonlyArray<Turn> => {
  const turns: Array<{
    id: string;
    asks: TurnRow[];
    rows: Row[];
    ended: EndedRow | null;
  }> = [];
  for (const row of rows) {
    const last = turns.at(-1);
    if (row.kind === 'turn') {
      // Words sent while it worked belong to the turn they steered, where
      // they came in among its work.
      if (row.steered && last !== undefined && last.ended === null)
        last.rows.push(row);
      else turns.push({ id: row.id, asks: [row], rows: [], ended: null });
    } else if (row.kind === 'ended') {
      if (last !== undefined) last.ended = row;
    } else if (last !== undefined) last.rows.push(row);
    // Rows before any turn, as a subagent's are, have no turn to sit in.
    else
      turns.push({ id: `${row.id}:turn`, asks: [], rows: [row], ended: null });
  }
  return turns;
};

export type Piece =
  | { readonly kind: 'said'; readonly row: SaidRow }
  /** Words you sent while it worked. */
  | { readonly kind: 'ask'; readonly row: TurnRow }
  | {
      readonly kind: 'work';
      readonly id: string;
      readonly rows: ReadonlyArray<Row>;
    };

export const piecesOf = (rows: ReadonlyArray<Row>): ReadonlyArray<Piece> => {
  const pieces: Array<Piece & { rows?: Row[] }> = [];
  for (const row of rows) {
    if (isSaid(row)) {
      pieces.push({ kind: 'said', row });
      continue;
    }
    if (row.kind === 'turn') {
      pieces.push({ kind: 'ask', row });
      continue;
    }
    const last = pieces.at(-1);
    if (last?.kind === 'work') (last.rows as Row[]).push(row);
    else pieces.push({ kind: 'work', id: `${row.id}:work`, rows: [row] });
  }
  return pieces;
};

/** What the agent said in a turn, as one text, to copy. */
export const saidIn = (turn: Turn) =>
  turn.rows
    .flatMap((row) => (row.kind === 'text' ? [row.text] : []))
    .join('\n\n');

/**
 * Each turn's cost, by itself and so far. Claude reports a running total
 * for the session, carried on across restarts, not what each turn cost:
 * a turn's own is its total less the last one before it. A total that went
 * down was started over, as by a /clear: then it is all this turn's. A
 * fork's first total also holds the turns it was forked from, so there it
 * is only the session's so far. Codex reports no cost.
 */
export const spendsOf = (
  turns: ReadonlyArray<Turn>,
  forked: boolean,
): ReadonlyMap<string, Spend> => {
  const spends = new Map<string, Spend>();
  let before: number | null = forked ? null : 0;
  for (const turn of turns) {
    const total = turn.ended?.usage?.costUsd ?? null;
    if (total === null) continue;
    spends.set(turn.id, {
      turn: before === null ? null : total >= before ? total - before : total,
      total,
    });
    before = total;
  }
  return spends;
};
