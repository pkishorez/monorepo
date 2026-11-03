import { useRouter } from '@kestack/kabuki/routing';
import { MONOREPO, PACKAGES, packageOf } from '../../shared/index.ts';
import { PackageBrand, StackBrand } from './brand.tsx';
import type { Route } from '../../shared/index.ts';
import { GithubLink } from './github-link.tsx';
import { MobileNav } from './mobile-nav.tsx';
import { Search } from './search.tsx';
import { column } from './styles.ts';
import { ThemeToggle } from './theme-toggle.tsx';
import { PackageLink, packageAt } from './package-link.tsx';

/*
 * The bar over every page: the menu on a phone, then whose place it is.
 * On the stack's home, its logo and the packages; inside a package, only
 * the package's logo, which with its sidebar is the way back out. Then
 * search, GitHub and the theme.
 */

export function Header() {
  const { route } = useRouter<Route>();
  const here = packageAt(route);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className={`${column} flex h-14 items-center gap-3`}>
        <MobileNav />
        {here ? (
          <PackageBrand id={here} />
        ) : (
          <>
            <StackBrand />
            <span aria-hidden className="hidden h-5 w-px bg-border lg:block" />
            <nav
              aria-label="Packages"
              className="hidden items-center gap-1 lg:flex"
            >
              {PACKAGES.map((entry) => (
                <PackageLink
                  key={entry.id}
                  id={entry.id}
                  className="flex h-8 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                >
                  <span className="font-medium">{entry.name}</span>
                </PackageLink>
              ))}
            </nav>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Search />
          <GithubLink
            {...(here
              ? { href: `${MONOREPO}/tree/main/${packageOf(here).code}` }
              : {})}
          />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
