import type { ReactNode } from 'react';
import { Brand } from './brand.tsx';

/*
 * What stands in front of Console while nobody may enter yet: signed out,
 * turned away, or the sign-in service gone. One column, centered on a
 * desktop and at the top third on a phone, one message and one action.
 */

export function Gate({
  title,
  children,
  description,
}: {
  readonly title: string;
  readonly description: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pt-[18dvh] pb-12 sm:justify-center sm:pt-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Brand />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          <p className="text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
