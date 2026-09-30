import { MailIcon } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { FOLDERS, type FolderId, inFolder, type Mail } from './data.ts';

/**
 * The left sidebar: every folder, with how much is in it; unread mail for
 * the inbox.
 */
export function Folders(props: {
  readonly mails: ReadonlyArray<Mail>;
  readonly current: FolderId;
  readonly onPick: (folder: FolderId) => void;
}) {
  return (
    <nav className="flex h-full flex-col gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))]">
      <div className="flex h-14 items-center gap-2.5 px-2">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <MailIcon aria-hidden="true" className="size-4" />
        </span>
        <span className="font-semibold tracking-tight">Mail</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {FOLDERS.map((folder) => {
          const here = props.mails.filter((m) => inFolder(m, folder.id));
          const count =
            folder.id === 'inbox'
              ? here.filter((m) => m.unread).length
              : here.length;
          const active = folder.id === props.current;
          return (
            <li key={folder.id}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors duration-150',
                  active
                    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60',
                )}
                onClick={() => props.onPick(folder.id)}
              >
                <folder.icon aria-hidden="true" className="size-4.5 shrink-0" />
                <span className="flex-1 truncate">{folder.title}</span>
                {count > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {count}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
