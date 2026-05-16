import { cn } from '@monorepo/frontend/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  BookOpenIcon,
  FileTextIcon,
  LucideGithub,
  LucideLinkedin,
  LucideTwitter,
  SunIcon,
} from '@monorepo/frontend/lucide';
import { useTheme } from '@/components/theme';

export const Route = createFileRoute('/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { toggleTheme } = useTheme();

  return (
    <div
      className={cn(
        'max-w-2xl mx-auto min-h-dvh',
        'flex items-center',
        'isolate',
      )}
    >
      {/* Header with theme toggle */}
      <div
        className={cn(
          'p-4 flex items-center justify-end gap-2',
          'fixed top-0 left-0 right-0 z-100',
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="hover:bg-accent/50"
        >
          <SunIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Main content */}
      <div className="p-4 pb-14 flex flex-col gap-8 w-full my-10">
        {/* Hero section */}
        <div className="space-y-2">
          <h1 className="text-6xl text-foreground/85 font-bold tracking-tight">
            Kishore
          </h1>
          <p className="text-xl text-muted-foreground font-medium">
            Software Engineer
          </p>
        </div>

        {/* Nav */}
        <div className="flex flex-col gap-2">
          <Link to="/docs">
            <div className="border border-border/40 rounded-lg p-4 hover:border-border/60 hover:bg-accent/30 transition-all group flex items-center gap-3">
              <BookOpenIcon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <div className="flex-1">
                <div className="text-base font-medium group-hover:text-primary transition-colors">
                  Docs
                </div>
                <div className="text-sm text-muted-foreground">
                  Generated documentation across monorepo packages.
                </div>
              </div>
            </div>
          </Link>
          <Link to="/blog">
            <div className="border border-border/40 rounded-lg p-4 hover:border-border/60 hover:bg-accent/30 transition-all group flex items-center gap-3">
              <FileTextIcon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <div className="flex-1">
                <div className="text-base font-medium group-hover:text-primary transition-colors">
                  Blog
                </div>
                <div className="text-sm text-muted-foreground">
                  Writing on Effect, fibers, and runtime design.
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Social links */}
        <div className="space-y-3">
          <h3 className="text-lg font-medium text-foreground/80">Connect</h3>
          <div className="flex gap-2">
            <a
              href="https://github.com/pkishorez"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                size="sm"
                className="hover:bg-accent/50 hover:border-accent group"
              >
                <LucideGithub className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
                GitHub
              </Button>
            </a>
            <a
              href="https://www.linkedin.com/in/pkishorez/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                size="sm"
                className="hover:bg-accent/50 hover:border-accent group"
              >
                <LucideLinkedin className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
                LinkedIn
              </Button>
            </a>
            <a
              href="https://x.com/pkishorez"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                size="sm"
                className="hover:bg-accent/50 hover:border-accent group"
              >
                <LucideTwitter className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
                Twitter / X
              </Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
