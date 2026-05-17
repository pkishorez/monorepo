import { AlertTriangleIcon } from '@monorepo/frontend/lucide';

export function ErrorBanner({ baseUrl }: { baseUrl: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-md border border-destructive/40 bg-destructive/5 text-sm">
      <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
      <div className="flex-1 min-w-0">
        Couldn't reach lotel at <span className="font-mono">{baseUrl}</span>.
        Retrying...
      </div>
    </div>
  );
}
