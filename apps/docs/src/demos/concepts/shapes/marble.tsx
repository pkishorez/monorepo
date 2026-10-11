import type { CSSProperties } from 'react';
import { SOURCE } from './sources.js';
import type { Source } from './sources.js';

/** The look of one Marble: filled in its Source's colour, or hollow for a Message that was ignored or dropped. */
export const marbleStyle = (
  source: Source,
  hollow: boolean,
  size = 10,
): CSSProperties => ({
  display: 'block',
  width: size,
  height: size,
  borderRadius: '50%',
  boxSizing: 'border-box',
  border: `2px solid ${SOURCE[source].color}`,
  background: hollow ? 'var(--background)' : SOURCE[source].color,
});

/** One Message as a dot, coloured by its Source; hollow when it was ignored or dropped. */
export const Marble = ({
  source,
  hollow = false,
  size,
}: {
  readonly source: Source;
  readonly hollow?: boolean;
  readonly size?: number;
}) => <span aria-hidden style={marbleStyle(source, hollow, size)} />;
