import { FileTextIcon } from '@kestack/web-platform/ui/components/lucide';
import { type Kind, Output } from '../../output/index.ts';

/** A file read: opened, what the agent saw of it. */
export const read: Kind = {
  icon: FileTextIcon,
  Detail: ({ row, opening }) => (
    <Output row={row} opening={opening} label="What it read" />
  ),
};
