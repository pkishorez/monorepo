import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

// Before promotion: a next shape, tried out as a draft. Reads see `priority`;
// writes still land at v1, without it.
const beforePromotion = ESchema.make('Ticket', {
  subject: Schema.String,
})
  .draft(
    { subject: Schema.String, priority: Schema.Number },
    {
      forward: (previous) => ({ ...previous, priority: 0 }),
      backward: (draft) => ({ subject: draft.subject }),
    },
  )
  .build();

// After promotion: a plain source edit. The draft's delta and forward
// migration become `.evolve('v2', ...)` as-is; `backward` is dropped, because
// encode now targets v2 directly instead of downgrading to v1.
const afterPromotion = ESchema.make('Ticket', {
  subject: Schema.String,
})
  .evolve(
    'v2',
    { subject: Schema.String, priority: Schema.Number },
    (previous) => ({ ...previous, priority: 0 }),
  )
  .build();

export const promotingADraft = Story.make({
  title: 'Promoting a draft',
  description:
    'Promotion is a source edit, not a runtime call — and it never rewrites what a draft already wrote.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A row was written while priority was still just a draft field — so it was downgraded away before it ever reached storage. What happens to that row once the draft is promoted?',
      {
        answer:
          "It decodes through the promoted schema's normal migration chain, same as any v1 row would. The forward migration is unchanged by promotion, so a row from before promotion gets the same default it would have gotten as a draft read — never the value that was in memory right before the backward migration threw it away.",
        proof: Effect.gen(function* () {
          const writtenAsDraft = yield* beforePromotion.encode({
            subject: 'Printer on fire',
            priority: 5,
          });
          yield* Story.assert(
            'the stored row never had priority to begin with',
            writtenAsDraft._v === 'v1' && !('priority' in writtenAsDraft),
          );
          const decoded = yield* afterPromotion.decode(writtenAsDraft);
          yield* Story.assert(
            'the promoted schema decodes it like any other v1 row — the migration default, not the original 5',
            decoded.subject === 'Printer on fire' && decoded.priority === 0,
          );
          return { writtenAsDraft, decoded };
        }),
      },
    ),
    Story.question('Once promoted, what does a fresh encode write now?', {
      answer:
        'The new version directly — v2, with priority included. Nothing downgrades any more, because encode always targets the last published version, and that is v2 now.',
      proof: Effect.gen(function* () {
        const encoded = yield* afterPromotion.encode({
          subject: 'Printer on fire',
          priority: 5,
        });
        yield* Story.assert(
          'the encoded value is stamped v2 and keeps priority',
          encoded._v === 'v2' && encoded.priority === 5,
        );
        return encoded;
      }),
    }),
  ],
});
