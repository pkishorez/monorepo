import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import './stage.css';

// Renders happen one frame at a time, so any clock-driven animation would
// flicker. The stage freezes every CSS animation and transition inside it;
// movement comes only from the video frame.
export function Stage({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill className="explainer-stage bg-background font-sans text-foreground">
      {children}
    </AbsoluteFill>
  );
}
