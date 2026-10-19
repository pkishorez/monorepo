import type { ReactNode, SVGProps } from 'react';

/*
 * The few icons the Inspector draws, from Lucide (ISC), inline so the
 * devtools need no icon package. Each is 24 by 24 at the stroke of the
 * text, and takes the props of an `<svg>`.
 */

type Props = SVGProps<SVGSVGElement>;

const icon = (paths: ReactNode) =>
  function Icon(props: Props) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        {paths}
      </svg>
    );
  };

export const ChevronDown = icon(<path d="m6 9 6 6 6-6" />);
export const ChevronLeft = icon(<path d="m15 18-6-6 6-6" />);
export const ChevronRight = icon(<path d="m9 18 6-6-6-6" />);
export const Minus = icon(<path d="M5 12h14" />);
export const Plus = icon(
  <>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </>,
);
export const X = icon(
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>,
);
export const ArrowUpRight = icon(
  <>
    <path d="M7 7h10v10" />
    <path d="M7 17 17 7" />
  </>,
);
export const Zap = icon(
  <path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />,
);
export const Box = icon(
  <>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </>,
);
export const Boxes = icon(
  <>
    <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
    <path d="m7 16.5-4.74-2.85" />
    <path d="m7 16.5 5-3" />
    <path d="M7 16.5v5.17" />
    <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
    <path d="m17 16.5-5-3" />
    <path d="m17 16.5 4.74-2.85" />
    <path d="M17 16.5v5.17" />
    <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
    <path d="M12 8 7.26 5.15" />
    <path d="m12 8 4.74-2.85" />
    <path d="M12 13.5V8" />
  </>,
);
export const RefreshCw = icon(
  <>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </>,
);
export const Maximize = icon(
  <>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </>,
);
export const GitBranch = icon(
  <>
    <path d="M15 6a9 9 0 0 0-9 9V3" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
  </>,
);
/** Kabuki's mark for the devtools' button: a tree of Actors. */
export const Tree = icon(
  <>
    <rect x="9" y="3" width="6" height="5" rx="1.5" />
    <rect x="3" y="16" width="6" height="5" rx="1.5" />
    <rect x="15" y="16" width="6" height="5" rx="1.5" />
    <path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
  </>,
);
