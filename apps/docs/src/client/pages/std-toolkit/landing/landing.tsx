import { Field } from '../../../field/index.ts';
import { Idea } from '../../landing/index.ts';
import { Ending } from './ending.tsx';
import { Opening } from './opening.tsx';
import { IDEAS } from './story.ts';

/*
 * std-toolkit's landing page, told as kabuki's is: over a cloud of
 * particles that takes a new shape for each stop. First the tagline beside
 * a real table three releases share, then one idea per Part of the docs,
 * and last where to go next. Every word after the first screen is in
 * story.ts.
 */

export function Landing() {
  return (
    <>
      <Field follower={false} />
      <main className="relative z-[1]">
        <Opening />
        {IDEAS.map((idea, index) => (
          <Idea key={idea.shape} idea={idea} index={index} />
        ))}
        <Ending />
      </main>
    </>
  );
}
