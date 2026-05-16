import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@monorepo/frontend/components/ui/button';
import { SunIcon } from '@monorepo/frontend/lucide';
import { useTheme } from '@/components/theme';

export const Route = createFileRoute('/dev/')({
  component: DevIndex,
});

function DevIndex() {
  const { toggleTheme } = useTheme();

  return (
    <div className="min-h-dvh p-8 max-w-2xl mx-auto">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground/90">Dev</h1>
            <p className="text-muted-foreground text-sm mt-1">Internal tools</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme}>
            <SunIcon className="size-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <Link
            to="/dev/ui"
            className="block p-4 rounded-lg border border-border/40 hover:border-border hover:bg-muted/30 transition-colors"
          >
            <div className="font-medium">UI Components</div>
            <div className="text-sm text-muted-foreground">
              Preview all UI components from @monorepo/frontend
            </div>
          </Link>
          <Link
            to="/dev/forms"
            className="block p-4 rounded-lg border border-border/40 hover:border-border hover:bg-muted/30 transition-colors"
          >
            <div className="font-medium">Forms</div>
            <div className="text-sm text-muted-foreground">
              Type-safe forms with validation from @monorepo/frontend/form
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
