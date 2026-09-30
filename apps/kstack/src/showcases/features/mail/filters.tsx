import { Switch } from '@kstackz/ui-toolkit/components/ui/switch';
import { MailIcon, PaperclipIcon } from '@kstackz/ui-toolkit/lucide';
import { Avatar } from './avatar.tsx';
import { ME } from './data.ts';

/** Which mail the list shows, on top of its folder. */
export interface Filter {
  readonly unread: boolean;
  readonly attachments: boolean;
}

export const NO_FILTER: Filter = { unread: false, attachments: false };

const OPTIONS = [
  { key: 'unread', title: 'Unread only', icon: MailIcon },
  { key: 'attachments', title: 'With attachments', icon: PaperclipIcon },
] as const;

/** The right sidebar: whose mail it is, and the filters on the list. */
export function Filters(props: {
  readonly filter: Filter;
  readonly onChange: (filter: Filter) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))]">
      <div className="flex h-14 items-center gap-3 px-2">
        <Avatar name={ME.name} className="size-9" />
        <span className="grid min-w-0 leading-tight">
          <span className="truncate font-medium">{ME.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {ME.email}
          </span>
        </span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {OPTIONS.map((option) => (
          <li key={option.key}>
            <label className="flex h-11 items-center gap-3 rounded-lg px-3 text-[15px]">
              <option.icon
                aria-hidden="true"
                className="size-4.5 text-muted-foreground"
              />
              <span className="flex-1">{option.title}</span>
              <Switch
                checked={props.filter[option.key]}
                onCheckedChange={(checked) =>
                  props.onChange({ ...props.filter, [option.key]: checked })
                }
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
