import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import type { ReactNode } from 'react';

import { shortenHome } from '../../../server/rpc/contract/index.js';

const rows = [
  { depth: 0, name: 'w-16', folder: true },
  { depth: 0, name: 'w-20', folder: true },
  { depth: 0, name: 'w-10', folder: true },
  { depth: 1, name: 'w-24', folder: true },
  { depth: 2, name: 'w-28', folder: false },
  { depth: 2, name: 'w-20', folder: false },
  { depth: 2, name: 'w-32', folder: false },
  { depth: 1, name: 'w-14', folder: true },
  { depth: 0, name: 'w-24', folder: false },
  { depth: 0, name: 'w-28', folder: false },
  { depth: 0, name: 'w-20', folder: false },
  { depth: 0, name: 'w-24', folder: false },
];

export function Waiting({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="h-full overflow-hidden px-3 pt-3">
      <div className="mx-auto w-full max-w-[616px] pl-[52px] sm:pl-[84px]">
        <p
          role="status"
          title={title}
          className="flex h-8 min-w-0 items-center gap-2 text-xs text-muted-foreground"
        >
          <Spinner className="size-3.5 shrink-0 opacity-70" />
          <span className="min-w-0 truncate">{children}</span>
        </p>
        <div
          aria-hidden
          className="pt-2 [mask-image:linear-gradient(to_bottom,black_45%,transparent)]"
        >
          {rows.map(({ depth, name, folder }, index) => (
            <div
              key={index}
              className="flex h-[26px] items-center gap-2"
              style={{ paddingLeft: 8 + depth * 16 }}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {folder ? (
                  <Skeleton className="size-2 rounded-sm motion-reduce:animate-none" />
                ) : null}
              </span>
              <Skeleton className="size-4 shrink-0 rounded-sm motion-reduce:animate-none" />
              <Skeleton
                className={`h-2.5 rounded-full motion-reduce:animate-none ${name}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Opening({
  name,
  root,
}: {
  name: string | null;
  root: string | null;
}) {
  return (
    <Waiting {...(root === null ? {} : { title: shortenHome(root) })}>
      {name === null ? 'Finding the project…' : `Opening ${name}…`}
    </Waiting>
  );
}
