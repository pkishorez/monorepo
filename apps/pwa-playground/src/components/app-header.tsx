import { Link } from '@tanstack/react-router';
import { Badge } from 'kui-toolkit/components/ui/badge';
import { useOnline } from 'pwa-toolkit/react';
import { buildLabel, buildPreset, pwaEnabled } from '../lib/build.ts';

export function AppHeader() {
  const online = useOnline();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
        <Link to="/" className="font-semibold" data-testid="nav-home">
          PWA Playground
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge variant="outline" data-testid="build-label">
            build {buildLabel}
          </Badge>
          <Badge variant="outline" data-testid="build-preset">
            preset {buildPreset}
          </Badge>
          {pwaEnabled ? null : (
            <Badge variant="destructive" data-testid="kill-switch">
              Kill Switch build
            </Badge>
          )}
          <Badge
            variant={online ? 'secondary' : 'destructive'}
            data-testid="online"
          >
            {online ? 'online' : 'offline'}
          </Badge>
        </div>
      </div>
    </header>
  );
}
