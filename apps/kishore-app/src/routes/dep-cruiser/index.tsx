import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { DepcruiseVizResult } from 'dependency-cruiser-viz';
import { DependencyCruiserViz } from '@monorepo/frontend/components/blocks/dependency-cruiser-viz';

export const Route = createFileRoute('/dep-cruiser/')({
  component: () => (
    <ClientOnly>
      <DepCruiserRoute />
    </ClientOnly>
  ),
});

function DepCruiserRoute() {
  const result = useMemo(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    try {
      const json = JSON.parse(decodeURIComponent(hash)) as DepcruiseVizResult;
      console.log(json);
      return json;
    } catch {
      return null;
    }
  }, []);

  if (!result) {
    return (
      <div className="flex h-dvh items-center justify-center text-gray-500">
        No visualization config found in URL hash.
      </div>
    );
  }

  return <DependencyCruiserViz config={result.visualization} />;
}
