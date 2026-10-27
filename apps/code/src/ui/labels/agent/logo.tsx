import type { Agent } from './name.ts';
import { agentName } from './name.ts';

/*
 * The agents' marks, sized by the text beside them: Claude's spark, rays
 * of uneven length from one centre in its own terracotta, and Codex's
 * knot, six rounded links turned about one centre, in the colour of the
 * text. Each is an image named for its agent.
 */

const C = 12;

/** One ray of the spark, tapering from the centre to a rounded tip. */
const ray = (degrees: number, length: number) => {
  const a = (degrees * Math.PI) / 180;
  const along = (r: number, side: number, width: number) => {
    const x = C + r * Math.cos(a) - (side * width * Math.sin(a)) / 2;
    const y = C + r * Math.sin(a) + (side * width * Math.cos(a)) / 2;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  };
  return `M${along(0, -1, 2.4)}L${along(length, -1, 1.1)}A0.55 0.55 0 0 1 ${along(length, 1, 1.1)}L${along(0, 1, 2.4)}Z`;
};

/** Twelve rays, a little uneven, as the spark is. */
const SPARK = [10.5, 8.6, 9.8, 8, 10.2, 8.8, 10.6, 8.2, 9.6, 8.6, 10, 8.4]
  .map((length, at) => ray(at * 30 - 90 + (at % 2 === 0 ? 0 : 4), length))
  .join('');

export function ClaudeLogo({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Claude"
      className={`size-[1em] shrink-0 ${className ?? ''}`}
    >
      <path d={SPARK} fill="#D97757" />
    </svg>
  );
}

export function CodexLogo({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Codex"
      className={`size-[1em] shrink-0 ${className ?? ''}`}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.6}>
        {[0, 60, 120, 180, 240, 300].map((turn) => (
          <rect
            key={turn}
            x={8.6}
            y={2.6}
            width={6.8}
            height={11.2}
            rx={3.4}
            transform={`rotate(${turn} 12 12)`}
          />
        ))}
      </g>
    </svg>
  );
}

/** The agent's mark. */
export function AgentLogo({
  agent,
  className,
}: {
  readonly agent: Agent;
  readonly className?: string;
}) {
  return agent === 'claude' ? (
    <ClaudeLogo className={className} />
  ) : agent === 'codex' ? (
    <CodexLogo className={className} />
  ) : (
    <span className={className}>{agentName(agent)}</span>
  );
}
