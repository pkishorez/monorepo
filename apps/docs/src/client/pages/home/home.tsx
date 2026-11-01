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
 * new shape for each chapter, a journey down the page. First the one line
 * for the whole stack, then the packages in the order you would build an
 * app with them, then where to start. A comet follows the reader's scroll
 * through the field, and a rail counts the chapters. On a wide screen the
 * field sits behind the words, which keep a half of their own; on a phone
 * it holds the top of the screen and the words scroll up under its glass.
 */

function Home() {
  return (
    <>
      <Field follower />
      <main className="relative z-[1]">
        <Hero />
        {CHAPTERS.map((chapter, index) => (
          <Chapter key={chapter.shape} chapter={chapter} index={index} />
        ))}
        <Outro />
      </main>
      <Rail count={CHAPTERS.length} />
    </>
  );
}

export const HomeView = View.make(Pages.HomeLive, () => <Home />);
