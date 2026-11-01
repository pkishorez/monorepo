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
 * screen is in story.ts. On a wide screen the field sits behind the words;
 * on a phone it holds the top of the screen and the words scroll up under
 * its glass, once the opening screen has gone.
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
