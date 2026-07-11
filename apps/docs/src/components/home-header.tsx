import { Link } from '@tanstack/react-router';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import { Newspaper } from 'lucide-react';
import { appName } from '@/lib/shared';

export function HomeHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-fd-background/80 backdrop-blur-lg">
      <nav className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-4 px-4">
        <Link to="/" className="inline-flex items-center gap-2.5 font-semibold">
          <img
            src="/favicon.svg"
            alt=""
            width={20}
            height={20}
            className="size-5 rounded"
          />
          {appName}
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/blog"
            className="relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            activeProps={{
              className:
                'font-medium text-primary after:absolute after:-bottom-2.5 after:inset-x-2 after:h-0.5 after:rounded-full after:bg-primary hover:bg-primary/5 hover:text-primary',
            }}
          >
            <Newspaper className="size-3.5" />
            Blog
          </Link>
          <ThemeSwitch />
        </div>
      </nav>
    </header>
  );
}
