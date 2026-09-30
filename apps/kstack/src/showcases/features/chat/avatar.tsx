import { UsersIcon } from '@kstackz/ui-toolkit/lucide';
import type { Chat } from './data.ts';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

/** A chat's round picture: its initials, or a group mark, on its own hue. */
export function Avatar(props: {
  readonly chat: Pick<Chat, 'name' | 'hue' | 'group' | 'online'>;
  readonly size?: number;
}) {
  const { chat, size = 52 } = props;
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(to bottom, oklch(0.72 0.13 ${chat.hue}), oklch(0.6 0.14 ${chat.hue}))`,
      }}
      aria-hidden="true"
    >
      {chat.group ? (
        <UsersIcon style={{ width: size * 0.42, height: size * 0.42 }} />
      ) : (
        initialsOf(chat.name)
      )}
      {chat.online ? (
        <span className="absolute right-0 bottom-0 size-3.5 rounded-full bg-emerald-500 ring-2 ring-background" />
      ) : null}
    </span>
  );
}
