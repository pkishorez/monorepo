import { createFileRoute, Link } from '@tanstack/react-router';
import { SunIcon } from '@monorepo/frontend/lucide';
import { useTheme } from '@/components/theme';

export const Route = createFileRoute('/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { toggleTheme } = useTheme();

  return (
    <div className="max-w-2xl mx-auto min-h-dvh flex items-center p-6">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="fixed top-4 right-4 p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
      >
        <SunIcon className="size-4" />
      </button>
      <div className="flex flex-col gap-10 w-full">
        <div className="space-y-1">
          <h1 className="text-4xl font-semibold tracking-tight">Kishore</h1>
          <p className="text-lg text-muted-foreground">Software Engineer</p>
        </div>

        <Link
          to="/devtools"
          search={{ tool: 'otel' }}
          className="group block -mx-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
        >
          <span className="underline underline-offset-4 decoration-muted-foreground/40 group-hover:decoration-foreground transition-colors">
            DevTools
          </span>
          <p className="text-sm text-muted-foreground mt-1 group-hover:text-foreground/70 transition-colors">
            OTel trace viewer &amp; dependency graphs
          </p>
        </Link>

        <div className="flex gap-5 text-sm text-muted-foreground">
          <a
            href="https://github.com/pkishorez"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://www.linkedin.com/in/pkishorez/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            LinkedIn
          </a>
          <a
            href="https://x.com/pkishorez"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            X
          </a>
          <a
            href="mailto:kishore.iiitn@gmail.com"
            className="hover:text-foreground transition-colors"
          >
            Email
          </a>
        </div>
      </div>
    </div>
  );
}
