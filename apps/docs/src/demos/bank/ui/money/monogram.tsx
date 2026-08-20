import {
  Avatar,
  AvatarFallback,
} from '@monorepo/frontend/components/ui/avatar';
import { cn } from '@monorepo/frontend/lib/utils';
import { initials } from './money.ts';

export function Monogram({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-9 rounded-full', className)}>
      <AvatarFallback className="rounded-full bg-muted text-[0.7rem] font-medium tracking-wide text-muted-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
