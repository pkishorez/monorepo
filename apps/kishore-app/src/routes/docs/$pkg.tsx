import { createFileRoute, notFound } from '@tanstack/react-router';

import { VTestDocs } from '@monorepo/frontend/components/blocks/vtest/docs-view';
import { Button } from '@monorepo/frontend/components/ui/button';
import { MoonIcon, SunIcon } from '@monorepo/frontend/lucide';

import { useTheme } from '@/components/theme';
import { PackageSwitcher } from '@/docs/package-switcher';
import { findDocsEntry } from '@/docs/registry';

export const Route = createFileRoute('/docs/$pkg')({
  component: DocsPackagePage,
  loader: ({ params }) => {
    const entry = findDocsEntry(params.pkg);
    if (!entry) throw notFound();
    return { entry };
  },
});

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
    </Button>
  );
}

function DocsPackagePage() {
  const { entry } = Route.useLoaderData();
  return (
    <VTestDocs
      report={entry.report}
      packageHeader={<PackageSwitcher current={entry} />}
      themeToggle={<ThemeToggle />}
    />
  );
}
