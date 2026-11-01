import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/index.ts';
import { CHAPTERS } from './chapters.ts';
import { Chapter } from './chapter.tsx';
import { Field } from '../../field/index.ts';
import { Hero } from './hero.tsx';
import { Outro } from './outro.tsx';
import { Rail } from './rail.tsx';

/*
 * The stack's home: a story told over a cloud of particles that takes a
 * new shape for each stop, a journey down the page. First the one line
 * for the whole stack and its code, then the packages with docs to read,
 * kabuki alone today, then word that more is coming. The shapes take
 * alternate sides of a wide screen, so each change crosses it. A comet
 * follows the reader's scroll through the field, and a rail counts the
 * stops. On a wide screen the
 * field sits behind the words, which keep a half of their own; on a phone
 * it holds the top of the screen and the words scroll up under its glass.
 */

function Home() {
  return (
    <>
      <Field follower />
      <main className="relative z-[1]">
        <Hero />
        {CHAPTERS.map((chapter) => (
          <Chapter key={chapter.shape} chapter={chapter} />
        ))}
        <Outro />
      </main>
      {/* The opening and the ending are stops on it too. */}
      <Rail count={CHAPTERS.length + 2} />
    </>
  );
}

export const HomeView = View.make(Pages.HomeLive, () => <Home />);
