import { SvgImage } from '@/components/svg-image';

export function OverviewImage() {
  return (
    <SvgImage minHeight={160} title="Effect vs Fiber Relationship">
      <svg viewBox="0 0 600 160" className="w-full h-auto">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        <g transform="translate(100, 40)">
          <rect
            x="0"
            y="0"
            width="140"
            height="80"
            rx="8"
            className="fill-background stroke-foreground"
            strokeWidth="2"
          />
          <text
            x="70"
            y="35"
            textAnchor="middle"
            className="fill-foreground font-semibold text-sm"
          >
            Effect
          </text>
          <text
            x="70"
            y="55"
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
          >
            Description
          </text>
        </g>

        <g>
          <line
            x1="240"
            y1="80"
            x2="360"
            y2="80"
            className="stroke-muted-foreground"
            strokeWidth="2"
            markerEnd="url(#arrow)"
          />
          <rect
            x="270"
            y="70"
            width="60"
            height="20"
            className="fill-background"
          />
          <text
            x="300"
            y="80"
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
          >
            executed
          </text>
        </g>

        <g transform="translate(360, 40)">
          <rect
            x="0"
            y="0"
            width="140"
            height="80"
            rx="8"
            className="fill-background stroke-foreground"
            strokeWidth="2"
          />
          <text
            x="70"
            y="35"
            textAnchor="middle"
            className="fill-foreground font-semibold text-sm"
          >
            Fiber
          </text>
          <text
            x="70"
            y="55"
            textAnchor="middle"
            className="fill-muted-foreground text-xs"
          >
            Running Instance
          </text>
        </g>
      </svg>
    </SvgImage>
  );
}
