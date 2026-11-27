import type { Asking } from '../index.js';

const BLUEPRINT = '\n\n---\n';

const HEADING =
  "The app's Blueprint: one actor per line, by its path, then what it is; under it, the parts a Beat may open, its States with their data keys, its model, input and props keys, and its Messages' payload keys.";

const ABOUT = 'About: ';

const CHIPS = '; ';

export const promptOf = ({ question, chips }: Asking, tree: string | null) =>
  [
    question.trim(),
    ...(chips.length === 0 ? [] : [`\n${ABOUT}${chips.join(CHIPS)}`]),
    ...(tree === null ? [] : [`${BLUEPRINT}${HEADING}\n\n${tree}`]),
  ].join('');

export const questionOf = (prompt: string): Asking => {
  const [asked = ''] = prompt.split(BLUEPRINT);
  const all = asked.split('\n');
  const last = all.at(-1) ?? '';
  return last.startsWith(ABOUT)
    ? {
        question: all.slice(0, -1).join('\n').trim(),
        chips: last.slice(ABOUT.length).split(CHIPS),
      }
    : { question: asked.trim(), chips: [] };
};
