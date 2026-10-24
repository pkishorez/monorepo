import { Router, useRouter } from '@kestack/kabuki/routing';
import { Badge } from '@kestack/web-platform/ui/components/badge';
import { router } from '../../shared/index.ts';
import type { Route } from '../../shared/index.ts';

/*
 * Whose place a page is in, at the start of the header: the stack's logo on
 * its home, kabuki's own in kabuki's docs.
 */

export function StackBrand() {
  return (
    <Router.Link
      to={router.Home()}
      className="flex shrink-0 items-center gap-2 text-sm font-semibold"
    >
      <img
        src="/favicon.svg"
        alt=""
        width={20}
        height={20}
        // Black on white in the light theme, flipped to white on black in the dark.
        className="size-5 rounded dark:invert"
      />
      stack
    </Router.Link>
  );
}

/** kabuki's mark: a tree of three Actors, black on white or white on black, as the theme is. */
export function KabukiMark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={`shrink-0 rounded-[5px] bg-foreground text-background ${className ?? ''}`}
    >
      <path
        d="M10 6.5v3M10 9.5 6 13M10 9.5l4 3.5"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={10} cy={5.5} r={2} fill="currentColor" />
      <circle cx={5.5} cy={14} r={1.8} fill="currentColor" />
      <circle cx={14.5} cy={14} r={1.8} fill="currentColor" />
    </svg>
  );
}

/**
 * kabuki's logo in its header, marked alpha while it is this early: from a
 * docs page it leads to kabuki's landing page, and from there out to the
 * stack's home.
 */
export function KabukiBrand() {
  const { route } = useRouter<Route>();
  const atLanding = route._tag === 'Kabuki' && !route.page;
  return (
    <Router.Link
      to={atLanding ? router.Home() : router.Kabuki()}
      title={atLanding ? 'Back to ke stack' : 'kabuki home'}
      className="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight"
    >
      <KabukiMark className="size-5" />
      kabuki
      <Badge
        variant="outline"
        className="h-4 px-1.5 font-mono text-[10px] font-normal tracking-normal text-muted-foreground"
      >
        alpha
      </Badge>
    </Router.Link>
  );
}
