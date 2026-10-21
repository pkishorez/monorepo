import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/index.ts';
import { CHAPTERS } from './chapters.ts';
import { Chapter } from './chapter.tsx';
import { Field } from '../../field/index.ts';
import { Hero } from './hero.tsx';
import { Outro } from './outro.tsx';
import { Rail } from './rail.tsx';
import { Switcher } from './switcher.tsx';
import { useVariant } from './variant.ts';

/*
 * The stack's home: a story told over a cloud of particles that takes a
 * new shape for each chapter. First the one line for the whole stack, then
 * the packages in the order you would build an app with them, then where
 * to start. The field sits behind everything; the words sit on top, on
 * transparent ground so it shows through.
 *
 * It comes in two versions, to compare: `cloud`, and `journey`, where a
 * comet follows the scroll and a rail counts the chapters.
 */

function Home() {
  const [variant, setVariant] = useVariant();
  return (
    <>
      <Field follower={variant === 'journey'} />
      <main className="relative z-[1]">
        <Hero />
        {CHAPTERS.map((chapter, index) => (
          <Chapter key={chapter.shape} chapter={chapter} index={index} />
        ))}
        <Outro />
      </main>
      {variant === 'journey' && <Rail count={CHAPTERS.length} />}
      <Switcher variant={variant} onChange={setVariant} />
    </>
  );
}

export const HomeView = View.make(Pages.HomeLive, () => <Home />);
