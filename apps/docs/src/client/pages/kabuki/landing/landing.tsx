import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { Router } from '@kestack/kabuki/routing';
import { buttonVariants } from '@kestack/web-platform/components/button';
import { ArrowRightIcon } from '@kestack/web-platform/components/lucide';
import { router, toolkitOf } from '../../../../shared/index.ts';
import { column } from '../../../components/index.ts';
import { Hero } from './hero/hero.tsx';
import { Actor } from './ideas/actor.tsx';
import { Compose } from './ideas/compose.tsx';
import { Renders } from './ideas/renders.tsx';
import { Rewind } from './ideas/rewind.tsx';
import { States } from './ideas/states.tsx';

/*
 * kabuki's landing page, the shape every toolkit's follows: its tagline and
 * one sentence beside a real app of its own, then its ideas, each a band
 * of its own across the page, backgrounds and sides alternating, its
 * picture on the band itself with no panel of its own. Black and white,
 * like the rest of the site.
 */

const IDEAS: ReadonlyArray<{
  readonly title: string;
  readonly body: ReactNode;
  readonly picture: ReactNode;
}> = [
  {
    title: 'Actor is the building block.',
    body: 'Each piece of logic gets an Actor of its own: the Model it holds, the Messages that change it, and the View that draws it. The View sends a Message, the Actor updates, and the View follows.',
    picture: <Actor />,
  },
  {
    title: 'States decide what runs.',
    body: 'Give an Actor a State machine. What it draws, and the Children and Workers it runs, exist only in the State that owns them. Leave the State and they stop, with nothing to clean up.',
    picture: <States />,
  },
  {
    title: 'Actors compose.',
    body: (
      <>
        Put Actors inside Actors. Some Children last as long as their parent;
        others only while it is in a given State. The parent draws whichever
        exist through <code className="font-mono text-base">children</code>.
      </>
    ),
    picture: <Compose />,
  },
  {
    title: 'Surgical updates only.',
    body: 'React draws; kabuki decides when. A Message re-renders the one Actor whose Model it changed, and nothing else. No memo, no selectors, nothing to tune.',
    picture: <Renders />,
  },
  {
    title: 'Rewind anything.',
    body: 'Every Message is kept, like git commits. Step back to any one and the app goes with you. Branch from there and carry on, while the app keeps running.',
    picture: <Rewind />,
  },
];

export function Landing() {
  const kabuki = toolkitOf('kabuki');
  return (
    <main>
      <section
        className={`${column} grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24`}
      >
        <div className="space-y-6">
          <p className="font-mono text-xs text-muted-foreground">
            kabuki · {kabuki.kind}
          </p>
          <h1 className="text-[2.25rem] leading-[1.05] min-[400px]:text-[2.5rem] font-semibold tracking-tight sm:text-6xl lg:text-[3.5rem] xl:text-6xl">
            <span className="whitespace-nowrap">The UI framework,</span>
            <br />
            <span className="whitespace-nowrap">built on Effect.</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            {kabuki.pitch.split(/(?<=\.) /).map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Router.Link
              to={router.Kabuki.Doc({ slug: 'quick-start' })}
              className={buttonVariants({ size: 'lg' })}
            >
              Quick start
              <ArrowRightIcon />
            </Router.Link>
            <Router.Link
              to={router.Kabuki.Doc({ slug: 'introduction' })}
              className={buttonVariants({ size: 'lg', variant: 'ghost' })}
            >
              Read the introduction
            </Router.Link>
          </div>
        </div>
        <Hero />
      </section>

      {/* Less motion asked for: the pictures change in place, without moving. */}
      <MotionConfig reducedMotion="user">
        {IDEAS.map((idea, index) => {
          const flipped = index % 2 === 1;
          return (
            <section
              key={idea.title}
              aria-labelledby={`idea-${index}`}
              className={`border-t border-border py-16 sm:py-24 ${flipped ? 'bg-background' : 'bg-muted/40'}`}
            >
              <div
                className={`${column} grid items-center gap-10 md:grid-cols-2 md:gap-16`}
              >
                <div className={`space-y-4 ${flipped ? 'md:order-2' : ''}`}>
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    {`${index + 1}`.padStart(2, '0')}
                  </p>
                  <h2
                    id={`idea-${index}`}
                    className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
                  >
                    {idea.title}
                  </h2>
                  <p className="max-w-md text-lg text-pretty text-muted-foreground">
                    {idea.body}
                  </p>
                </div>
                <div aria-hidden className="grid h-72 place-items-center">
                  {idea.picture}
                </div>
              </div>
            </section>
          );
        })}
      </MotionConfig>
    </main>
  );
}
