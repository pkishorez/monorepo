import { Router } from '@kestack/kabuki/routing';
import { buttonVariants } from '@kestack/web-platform/ui/components/button';
import { ArrowRightIcon } from 'lucide-react';
import { packageOf, router } from '../../../../shared/index.ts';
import { column } from '../../../components/index.ts';
import { shapeAt } from '../../../field/index.ts';
import { Hero } from './hero/hero.tsx';

/*
 * The first screen: std-toolkit's tagline and pitch beside a real table
 * that three releases of an app share. Behind it the field is only a
 * faint dust, which gathers into the first idea as the page scrolls.
 */

export function Opening() {
  const std = packageOf('std-toolkit');
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
            std-toolkit · {std.kind}
          </p>
          <h1 className="text-[2.25rem] leading-[1.05] font-semibold tracking-tight min-[400px]:text-[2.5rem] sm:text-6xl lg:text-[3.5rem] xl:text-6xl">
            <span className="whitespace-nowrap">Change its shape.</span>
            <br />
            <span className="whitespace-nowrap">Keep every row.</span>
          </h1>
          <p className="text-lg text-pretty text-muted-foreground">
            {std.pitch}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Router.Link
              to={router.StdToolkit.Doc({ slug: 'quick-start' })}
              className={buttonVariants({ size: 'lg' })}
            >
              Quick start
              <ArrowRightIcon />
            </Router.Link>
            <Router.Link
              to={router.StdToolkit.Doc({ slug: 'introduction' })}
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
