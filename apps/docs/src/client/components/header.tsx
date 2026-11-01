import { useRouter } from '@kestack/kabuki/routing';
import { TOOLKITS } from '../../shared/index.ts';
import { KabukiBrand, StackBrand } from './brand.tsx';
import type { Route } from '../../shared/index.ts';
import { GithubLink } from './github-link.tsx';
import { MobileNav } from './mobile-nav.tsx';
import { Search } from './search.tsx';
import { column } from './styles.ts';
import { ThemeToggle } from './theme-toggle.tsx';
import { ToolkitLink, inToolkit } from './toolkit-link.tsx';

/*
 * The bar over every page: the menu on a phone, then whose place it is.
 * On the stack's home, its logo and the toolkits; inside a toolkit, only
 * the toolkit's logo, which with its sidebar is the way back out. Then
 * search, GitHub and the theme.
 */

export function Header() {
  const { route } = useRouter<Route>();
  const kabuki = inToolkit(route, 'kabuki');
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className={`${column} flex h-14 items-center gap-3`}>
        <MobileNav />
        {kabuki ? (
          <KabukiBrand />
        ) : (
          <>
            <StackBrand />
            <span aria-hidden className="hidden h-5 w-px bg-border lg:block" />
            <nav
              aria-label="Toolkits"
              className="hidden items-center gap-1 lg:flex"
            >
              {TOOLKITS.map((toolkit) => (
                <ToolkitLink
                  key={toolkit.id}
                  id={toolkit.id}
                  className="flex h-8 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                >
                  <span className="font-medium">{toolkit.name}</span>
                </ToolkitLink>
              ))}
            </nav>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Search />
          <GithubLink
            {...(kabuki
              ? {
                  href: 'https://github.com/pkishorez/monorepo/tree/main/packages/kabuki',
                }
              : {})}
          />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
