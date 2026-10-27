import { SearchIcon } from '@kestack/web-platform/ui/components/lucide';
import { type Kind, Output } from '../../output/index.ts';

/** A search of the files: opened, what it found. */
export const search: Kind = {
  icon: SearchIcon,
  Detail: ({ row, opening }) => (
    <Output row={row} opening={opening} label="What it found" />
  ),
};
