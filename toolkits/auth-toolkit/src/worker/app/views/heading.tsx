import type { ReactNode } from 'react';
import { Skeleton, SkeletonText, cx } from '../ui/index.ts';

const tiles = {
  neutral: 'bg-muted text-foreground',
  success: 'bg-positive-soft text-positive',
  warning: 'bg-warning-soft text-warning',
};

/** What a task page says first: a 44px mark, the question or outcome, one line of why. */
export function TaskHeading({
  mark,
  tone = 'neutral',
  title,
  lead,
}: {
  /** An icon, drawn in a tile of `tone`; or a 44px ClientMark, drawn as is. */
  mark: ReactNode;
  tone?: keyof typeof tiles | 'none';
  title: string;
  lead?: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {tone === 'none' ? (
        mark
      ) : (
        <span
          className={cx(
            'grid size-11 place-items-center rounded-xl',
            tiles[tone],
          )}
        >
          {mark}
        </span>
      )}
      <h1 className="mt-6 text-[26px] leading-tight font-semibold tracking-[-0.01em]">
        {title}
      </h1>
      {lead ? (
        <p className="mt-2 text-muted-foreground text-pretty">{lead}</p>
      ) : null}
    </div>
  );
}

/** A TaskHeading still loading: its mark's tile and its words as bars, as they will lie. */
export function TaskHeadingPlaceholder({
  title,
  lead,
}: {
  /** Words as long as the title will be. */
  title: string;
  lead?: string;
}) {
  return (
    <div className="flex flex-col">
      <Skeleton className="size-11 rounded-xl" />
      <p className="mt-6 text-[26px] leading-tight font-semibold tracking-[-0.01em] text-balance">
        <SkeletonText>{title}</SkeletonText>
      </p>
      {lead ? (
        <p className="mt-2 text-pretty">
          <SkeletonText>{lead}</SkeletonText>
        </p>
      ) : null}
    </div>
  );
}
