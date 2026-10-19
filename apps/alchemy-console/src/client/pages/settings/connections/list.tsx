import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kestack/web-platform/components/alert-dialog';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@kestack/web-platform/components/avatar';
import { Button } from '@kestack/web-platform/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kestack/web-platform/components/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@kestack/web-platform/components/empty';
import {
  EllipsisIcon,
  ExternalLinkIcon,
  UnplugIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Spinner } from '@kestack/web-platform/components/spinner';
import {
  type GitHubConnection,
  manageUrlOf,
} from '../../../../shared/contracts/github/index.ts';

/*
 * The member's GitHub connections, each row the account's avatar and
 * login, how many repositories Console can see, and a menu to manage it on
 * GitHub or remove it from Console. Every state is drawn at the height of
 * the rows it waits for, so nothing below moves.
 */

const ROW = 'flex min-h-16 items-center gap-3 px-4 py-3';

const repositories = (count: number) =>
  count === 1 ? '1 repository' : `${count} repositories`;

function Row({
  connection,
  onRemove,
}: {
  readonly connection: GitHubConnection;
  readonly onRemove: () => void;
}) {
  return (
    <li className={ROW}>
      <Avatar size="lg">
        <AvatarImage src={connection.avatarUrl} alt="" />
        <AvatarFallback>
          {connection.accountLogin.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{connection.accountLogin}</span>
        <span className="truncate text-sm text-muted-foreground tabular-nums">
          {connection.accountType === 'Organization'
            ? 'Organization'
            : 'Personal account'}{' '}
          · {repositories(connection.repositoryCount)}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${connection.accountLogin}`}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            render={
              <a
                href={manageUrlOf(connection)}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ExternalLinkIcon />
            Manage on GitHub
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <UnplugIcon />
            Remove from Console
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function ConnectionList({
  connections,
  onRemove,
}: {
  readonly connections: ReadonlyArray<GitHubConnection>;
  readonly onRemove: (connectionId: string) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {connections.map((connection) => (
        <Row
          key={connection.connectionId}
          connection={connection}
          onRemove={() => onRemove(connection.connectionId)}
        />
      ))}
    </ul>
  );
}

export function NoConnections({
  connecting,
  onAdd,
}: {
  readonly connecting: boolean;
  readonly onAdd: () => void;
}) {
  return (
    <Empty className="rounded-lg border border-dashed border-border">
      <EmptyHeader>
        <EmptyTitle>No GitHub accounts yet</EmptyTitle>
        <EmptyDescription>
          Connect a GitHub account or organization, and pick its repositories
          for your projects.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onAdd} disabled={connecting}>
          {connecting && <Spinner aria-hidden />}
          Connect GitHub
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** The list while it is on the way: one row. */
export function ConnectionsSkeleton() {
  return (
    <div
      className="divide-y divide-border rounded-lg border border-border"
      aria-busy
    >
      <div className={ROW}>
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    </div>
  );
}

export function RemoveDialog({
  open,
  connection,
  busy,
  problem,
  onClose,
  onRemove,
}: {
  readonly open: boolean;
  /** The connection being removed, kept while the dialog closes. */
  readonly connection: GitHubConnection | null;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly onClose: () => void;
  readonly onRemove: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {connection?.accountLogin} from Console?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Console stops seeing its repositories and hearing its pushes. The
            App stays installed on GitHub: uninstall it there if nothing else
            uses it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {problem !== null && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={onRemove}>
            {busy && <Spinner aria-hidden />}
            Remove
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
