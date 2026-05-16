import { SvgImage } from '@/components/svg-image';

export function FiberOverviewImage() {
  return (
    <SvgImage minHeight={300} title="Fiber Lifecycle Overview">
      <svg
        viewBox="0 0 900 300"
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground" />
          </marker>
          <marker
            id="arrow-green"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-green-500" />
          </marker>
          <marker
            id="arrow-blue"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-blue-500" />
          </marker>
          <marker
            id="dot"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
          >
            <circle cx="5" cy="5" r="3" className="fill-foreground" />
          </marker>
          <marker
            id="dot-blue"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
          >
            <circle cx="5" cy="5" r="3" className="fill-blue-500" />
          </marker>
          <marker
            id="dot-green"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
          >
            <circle cx="5" cy="5" r="3" className="fill-green-500" />
          </marker>
          <marker
            id="dot-red"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
          >
            <circle cx="5" cy="5" r="3" className="fill-red-500" />
          </marker>
        </defs>

        {/* Global shift to fit in viewbox with ample padding */}
        <g transform="translate(180, 50.5)">
          {/* --- Row 1: Parent Fiber --- */}
          <g>
            <text
              x="-20"
              y="0"
              className="fill-foreground text-base font-bold"
              textAnchor="end"
              style={{ dominantBaseline: 'middle' }}
            >
              Parent Fiber
            </text>

            {/* Timeline */}
            <line
              x1="0"
              y1="0"
              x2="400"
              y2="0"
              className="stroke-foreground"
              strokeWidth="1.5"
              markerStart="url(#dot)"
            />

            {/* Exit Line */}
            <line
              x1="400"
              y1="-20"
              x2="400"
              y2="230"
              className="stroke-muted-foreground"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <rect
              x="365"
              y="-45"
              width="70"
              height="20"
              rx="4"
              className="fill-background"
            />
            <text
              x="400"
              y="-35"
              className="fill-muted-foreground text-xs font-semibold"
              textAnchor="middle"
              style={{ dominantBaseline: 'middle' }}
            >
              Parent Exits
            </text>
          </g>

          {/* --- Row 2: Daemon Fiber (Forked early, outlives) --- */}
          <g transform="translate(0, 70)">
            <text
              x="-20"
              y="0"
              className="fill-blue-500 text-sm font-medium"
              textAnchor="end"
              style={{ dominantBaseline: 'middle' }}
            >
              Daemon Fiber
            </text>

            {/* Fork Line from Parent (X=50) down to here (Y=0 relative to group) */}
            <path
              d="M 50.5 -70.5 L 50.5 0"
              className="stroke-blue-500/50"
              strokeWidth="1"
              strokeDasharray="3 3"
            />

            {/* Fork Label - Between Parent and Daemon */}
            <rect
              x="15.5"
              y="-43"
              width="70"
              height="16"
              rx="4"
              className="fill-background stroke-blue-500/20"
              strokeWidth="1"
            />
            <text
              x="50.5"
              y="-35"
              className="fill-blue-500 text-[9px] font-bold"
              textAnchor="middle"
              style={{ dominantBaseline: 'middle' }}
            >
              FORK DAEMON
            </text>

            {/* Fiber Line */}
            <line
              x1="50"
              y1="0"
              x2="550"
              y2="0"
              className="stroke-blue-500"
              strokeWidth="1.5"
              markerStart="url(#dot-blue)"
              markerEnd="url(#arrow-blue)"
            />
            <text
              x="560"
              y="0"
              className="fill-blue-500 text-xs font-bold"
              textAnchor="start"
              style={{ dominantBaseline: 'middle' }}
            >
              Outlives Parent
            </text>
          </g>

          {/* --- Row 3: Child (Joined) --- */}
          <g transform="translate(0, 140)">
            <text
              x="-20"
              y="0"
              className="fill-green-500 text-sm font-medium"
              textAnchor="end"
              style={{ dominantBaseline: 'middle' }}
            >
              Child (Joined)
            </text>

            {/* Fork Line from Parent (X=130) */}
            <path
              d="M 130.5 -140.5 L 130.5 0"
              className="stroke-green-500/50"
              strokeWidth="1"
              strokeDasharray="3 3"
            />

            {/* Fork Label - Moved to space between Blue (Daemon) and Green (Child) lines */}
            <rect
              x="112.5"
              y="-43"
              width="36"
              height="16"
              rx="4"
              className="fill-background stroke-green-500/20"
              strokeWidth="1"
            />
            <text
              x="130.5"
              y="-35"
              className="fill-green-500 text-[9px] font-bold"
              textAnchor="middle"
              style={{ dominantBaseline: 'middle' }}
            >
              FORK
            </text>

            {/* Fiber Line */}
            <line
              x1="130"
              y1="0"
              x2="320"
              y2="0"
              className="stroke-green-500"
              strokeWidth="1.5"
              markerStart="url(#dot-green)"
            />

            {/* Join Arrow back to Parent (X=350) */}
            <path
              d="M 320 0 C 340 0, 340 -140, 350 -140"
              className="stroke-green-500"
              strokeWidth="1.5"
              markerEnd="url(#arrow-green)"
              fill="none"
            />

            {/* Join Label */}
            <rect
              x="330"
              y="-83"
              width="30"
              height="16"
              rx="4"
              className="fill-background stroke-green-500/20"
              strokeWidth="1"
            />
            <text
              x="345"
              y="-75"
              className="fill-green-500 text-[9px] font-bold"
              textAnchor="middle"
              style={{ dominantBaseline: 'middle' }}
            >
              JOIN
            </text>
          </g>

          {/* --- Row 4: Child (Interrupted) --- */}
          <g transform="translate(0, 210)">
            <text
              x="-20"
              y="0"
              className="fill-red-500 text-sm font-medium"
              textAnchor="end"
              style={{ dominantBaseline: 'middle' }}
            >
              Child (Interrupted)
            </text>

            {/* Fork Line from Parent (X=210) */}
            <path
              d="M 210.5 -210.5 L 210.5 0"
              className="stroke-red-500/50"
              strokeWidth="1"
              strokeDasharray="3 3"
            />

            {/* Fork Label - Moved to space between Green (Child) and Red (Interrupted) lines */}
            <rect
              x="192.5"
              y="-43"
              width="36"
              height="16"
              rx="4"
              className="fill-background stroke-red-500/20"
              strokeWidth="1"
            />
            <text
              x="210.5"
              y="-35"
              className="fill-red-500 text-[9px] font-bold"
              textAnchor="middle"
              style={{ dominantBaseline: 'middle' }}
            >
              FORK
            </text>

            {/* Fiber Line */}
            <line
              x1="210"
              y1="0"
              x2="400"
              y2="0"
              className="stroke-red-500"
              strokeWidth="1.5"
              markerStart="url(#dot-red)"
            />

            {/* Interruption Mark (X) at Parent Exit X=400 */}
            <path
              d="M 395 -5 L 405 5 M 395 5 L 405 -5"
              className="stroke-red-500"
              strokeWidth="2"
            />
            <text
              x="415"
              y="0"
              className="fill-red-500 text-xs font-bold"
              textAnchor="start"
              style={{ dominantBaseline: 'middle' }}
            >
              Interrupted
            </text>
          </g>
        </g>
      </svg>
    </SvgImage>
  );
}
