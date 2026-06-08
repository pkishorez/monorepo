import { PackageIcon } from 'lucide-react';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';

import { RevealMore } from '../reveal';
import type { VtestPackage } from '../types';
import { AddPackage } from './add-package';
import { PackageCard } from './package-card';

interface VtestPackageListProps {
  packages: readonly VtestPackage[];
  discovery?: readonly string[];
  onOpenPackage: (pkg: VtestPackage) => void;
  onAddPackage: (path: string) => void;
}

/**
 * Home screen: the curated packages as spacious cards, with an add affordance
 * and an explicit empty state. Visible cards cap at 5 (5±2) with reveal-more.
 */
export function VtestPackageList({
  packages,
  discovery,
  onOpenPackage,
  onAddPackage,
}: VtestPackageListProps) {
  if (packages.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageIcon />
          </EmptyMedia>
          <EmptyTitle>No packages yet. Add a package.</EmptyTitle>
          <EmptyDescription>
            Point vtest at a package to start drilling into its tests.
          </EmptyDescription>
        </EmptyHeader>
        <AddPackage discovery={discovery} onAddByPath={onAddPackage} />
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Packages</h2>
        <AddPackage discovery={discovery} onAddByPath={onAddPackage} />
      </div>
      <RevealMore items={packages} itemKey={(p) => p.id}>
        {(pkg) => <PackageCard pkg={pkg} onOpen={onOpenPackage} />}
      </RevealMore>
    </div>
  );
}
