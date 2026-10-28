import { Field } from '../../../field/index.ts';
import { Author } from './author.tsx';
import { Idea } from './idea.tsx';
import { Opening } from './opening.tsx';
import { PriorArt } from './prior-art.tsx';
import { IDEAS } from './story.ts';

/*
 * kabuki's landing page, told the way the stack's home is: over a cloud of
 * particles that takes a new shape for each stop. First the tagline beside
 * a real kabuki app, then the five ideas, then where they come from, and
 * last who makes it and where to go next. Every word after the first
 * screen is in story.ts. The field sits behind everything; the words sit
 * on transparent ground so it shows through.
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
        <PriorArt />
        <Author />
      </main>
    </>
  );
}
