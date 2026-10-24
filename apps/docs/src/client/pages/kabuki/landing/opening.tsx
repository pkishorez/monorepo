import { shapeAt } from '../../../field/index.ts';
import { Router } from '@kestack/kabuki/routing';
import { buttonVariants } from '@kestack/web-platform/components/button';
import { ArrowRightIcon } from '@kestack/web-platform/components/lucide';
import { router, toolkitOf } from '../../../../shared/index.ts';
import { column } from '../../../components/index.ts';
import { Hero } from './hero/hero.tsx';

/*
 * The first screen: kabuki's tagline and pitch beside a real kabuki app.
 * Behind it the field is only a faint dust, which gathers into the first
 * idea as the page scrolls. The app's card is solid, so none shows through.
 */

export function Opening() {
  const kabuki = toolkitOf('kabuki');
  return (
    <section
      {...shapeAt('drift')}
      className="flex min-h-[calc(100svh-3.5rem)] flex-col justify-center"
    >
      <div
        className={`${column} grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24`}
      >
        <div className="space-y-6">
          <p className="font-mono text-xs text-muted-foreground">
            kabuki · {kabuki.kind}
          </p>
          <h1 className="text-[2.25rem] leading-[1.05] font-semibold tracking-tight min-[400px]:text-[2.5rem] sm:text-6xl lg:text-[3.5rem] xl:text-6xl">
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
      </div>
    </section>
  );
}
