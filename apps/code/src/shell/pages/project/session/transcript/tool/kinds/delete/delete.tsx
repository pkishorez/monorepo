import { Trash2Icon } from '@kestack/web-platform/ui/components/lucide';
import { type Kind, Output } from '../../output/index.ts';

/** A file deleted: opened, what the tool said of it. */
export const remove: Kind = {
  icon: Trash2Icon,
  Detail: ({ row, opening }) => <Output row={row} opening={opening} />,
};
