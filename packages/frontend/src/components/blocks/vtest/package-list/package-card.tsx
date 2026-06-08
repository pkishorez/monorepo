import { ChevronRightIcon, PackageIcon } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';

import type { VtestPackage } from '../types';

interface PackageCardProps {
  pkg: VtestPackage;
  onOpen: (pkg: VtestPackage) => void;
}

/** A single curated package, rendered as a spacious clickable card. */
export function PackageCard({ pkg, onOpen }: PackageCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(pkg)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(pkg);
        }
      }}
      className="cursor-pointer transition-colors hover:border-ring"
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
            <PackageIcon className="size-4" />
          </span>
          <div className="flex-1">
            <CardTitle>{pkg.name}</CardTitle>
            <CardDescription className="truncate font-mono text-xs">
              {pkg.path}
            </CardDescription>
          </div>
          <ChevronRightIcon className="size-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <span className="text-sm text-muted-foreground">
          {pkg.featureCount} feature{pkg.featureCount !== 1 ? 's' : ''}
        </span>
      </CardContent>
    </Card>
  );
}
