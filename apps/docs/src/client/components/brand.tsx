import { Router, useRouter } from '@kestack/kabuki/routing';
import { Badge } from '@kestack/web-platform/ui/components/badge';
import { packageOf, router } from '../../shared/index.ts';
import type { Package, Route } from '../../shared/index.ts';
import { inPackage, packageRoute, slugAt } from './package-link.tsx';

/*
 * Whose place a page is in, at the start of the header: the stack's logo on
 * its home, a package's own in its docs.
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

/** std-toolkit's mark: a table of three rows, its key column solid, as the theme is. */
export function StdToolkitMark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={`shrink-0 rounded-[5px] bg-foreground text-background ${className ?? ''}`}
    >
      {[5, 9, 13].map((y) => (
        <g key={y}>
          <rect
            x={4.5}
            y={y}
            width={3}
            height={2.4}
            rx={0.6}
            fill="currentColor"
          />
          <rect
            x={9}
            y={y}
            width={6.5}
            height={2.4}
            rx={0.6}
            fill="currentColor"
            opacity={0.5}
          />
        </g>
      ))}
    </svg>
  );
}

/** A package's mark, by its id. */
export function PackageMark({
  id,
  className,
}: {
  readonly id: Package['id'];
  readonly className?: string;
}) {
  return id === 'kabuki' ? (
    <KabukiMark {...(className ? { className } : {})} />
  ) : (
    <StdToolkitMark {...(className ? { className } : {})} />
  );
}

/**
 * A package's logo in its header, marked alpha while it is this early:
 * from a docs page it leads to the package's landing page, and from there
 * out to the stack's home.
 */
export function PackageBrand({ id }: { readonly id: Package['id'] }) {
  const { route } = useRouter<Route>();
  const atLanding = inPackage(route, id) && slugAt(route) === undefined;
  const { name } = packageOf(id);
  return (
    <Router.Link
      to={atLanding ? router.Home() : packageRoute(id)}
      title={atLanding ? 'Back to ke stack' : `${name} home`}
      className="flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight"
    >
      <PackageMark id={id} className="size-5" />
      {name}
      <Badge
        variant="outline"
        className="h-4 px-1.5 font-mono text-[10px] font-normal tracking-normal text-muted-foreground"
      >
        alpha
      </Badge>
    </Router.Link>
  );
}
