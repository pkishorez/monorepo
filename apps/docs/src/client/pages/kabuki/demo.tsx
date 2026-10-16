import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { ArrowLeftIcon } from '@kestack/web-platform/components/lucide';
import { Pages, router } from '../../../shared/index.ts';
import { ThemeToggle } from '../../components/index.ts';
import { OpeningAnApp } from '../../demos/opening-an-app/index.ts';

/** Opening an app, full screen, with a way back to the docs in its header. */
export const DemoView = View.make(Pages.DemoLive, () => (
  <div className="h-dvh">
    <OpeningAnApp
      actions={
        <div className="-mr-2 flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <Router.Link
            to={router.Kabuki.Doc({ slug: 'introduction' })}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Docs
          </Router.Link>
        </div>
      }
    />
  </div>
));
