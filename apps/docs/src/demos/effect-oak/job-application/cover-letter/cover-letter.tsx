import { Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Answers, report } from '../application/index.js';
import { TextArea } from '../fields/index.js';

/*
 * The cover letter: one textarea and a count of characters left. Going over
 * the limit marks the textarea invalid but, as in Foldkit, does not block
 * submitting, so the step is always complete and needs no reveal.
 */

const MAX_LENGTH = 2000;
const WARNING_CHARS = 200;

export const CoverLetter = Node.make('CoverLetter', {
  requires: { answers: Answers },
  model: Schema.Struct({ content: Schema.String }),
  message: Schema.TaggedUnion({ Edited: { content: Schema.String } }),
}).build({
  init: () => ({ model: { content: '' } }),
  update: {
    Edited: ({ content }) => ({
      model: { content },
      commands: [
        report({
          _tag: 'CoverLetter',
          hasErrors: false,
          complete: true,
          content,
        }),
      ],
    }),
  },
});

export const CoverLetterView = View.make(CoverLetter, ({ model, send }) => {
  const remaining = MAX_LENGTH - model.content.length;
  const tone =
    remaining < 0
      ? 'font-medium text-destructive'
      : remaining <= WARNING_CHARS
        ? 'font-medium text-amber-600'
        : '';
  return (
    <TextArea
      id="cover-letter"
      label="Cover letter"
      rows={12}
      placeholder="Tell us why you want to work on Effect Oak and what excites you about the Elm Architecture…"
      value={model.content}
      error={remaining < 0 ? `${-remaining} characters over the limit` : null}
      hint={
        <span className="flex justify-between gap-4">
          <span>A strong cover letter helps your application stand out.</span>
          <span className={tone}>{remaining} characters remaining</span>
        </span>
      }
      onChange={(content) => send({ _tag: 'Edited', content })}
    />
  );
});
