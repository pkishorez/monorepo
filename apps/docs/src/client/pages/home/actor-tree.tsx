/*
 * kabuki's picture on the home page: an app as a tree of Actors, with
 * Messages running along it. Only a picture: no app runs behind it. The
 * Messages stand still for a reader who asks for less motion.
 */

type Node = {
  readonly name: string;
  readonly state: string;
  readonly x: number;
  readonly y: number;
};

const NODES = {
  app: { name: 'App', state: 'SignedIn', x: 220, y: 52 },
  session: { name: 'Session', state: 'Live', x: 84, y: 150 },
  sync: { name: 'Sync', state: 'Running', x: 220, y: 150 },
  files: { name: 'Files', state: 'Idle', x: 356, y: 150 },
  a: { name: 'File a', state: 'Uploading', x: 300, y: 248 },
  b: { name: 'File b', state: 'Done', x: 412, y: 248 },
} as const satisfies Record<string, Node>;

const EDGES = [
  ['app', 'session'],
  ['app', 'sync'],
  ['app', 'files'],
  ['files', 'a'],
  ['files', 'b'],
] as const;

const W = 104;
const H = 44;

const path = (from: Node, to: Node) => {
  const y1 = from.y + H / 2;
  const y2 = to.y - H / 2;
  const mid = (y1 + y2) / 2;
  return `M ${from.x} ${y1} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${y2}`;
};

// Each Message: the edge it runs on, up from a Child or down to it, when it starts and how long it takes.
const MESSAGES = [
  { edge: 1, up: true, begin: 0, dur: 1.6 },
  { edge: 3, up: true, begin: 0.6, dur: 1.4 },
  { edge: 0, up: false, begin: 1.4, dur: 1.6 },
  { edge: 2, up: false, begin: 2.2, dur: 1.5 },
  { edge: 1, up: true, begin: 2.8, dur: 1.6 },
  { edge: 4, up: true, begin: 3.6, dur: 1.4 },
] as const;
const CYCLE = 4.8;

export function ActorTree() {
  return (
    <svg
      viewBox="0 0 496 300"
      aria-hidden
      className="absolute inset-0 m-auto h-full max-h-96 w-full p-6 text-muted-foreground"
    >
      {EDGES.map(([from, to]) => (
        <path
          key={to}
          d={path(NODES[from], NODES[to])}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.35}
        />
      ))}
      <g className="motion-reduce:hidden">
        {MESSAGES.map((message, index) => {
          const [from, to] = EDGES[message.edge];
          return (
            <circle key={index} r={3.5} className="fill-foreground" opacity={0}>
              <animateMotion
                path={path(NODES[from], NODES[to])}
                dur={`${CYCLE}s`}
                begin={`${message.begin}s`}
                repeatCount="indefinite"
                keyPoints={message.up ? '1;1;0;0' : '0;0;1;1'}
                keyTimes={`0;0.001;${(message.dur / CYCLE).toFixed(3)};1`}
                calcMode="linear"
              />
              <animate
                attributeName="opacity"
                dur={`${CYCLE}s`}
                begin={`${message.begin}s`}
                repeatCount="indefinite"
                values="0;1;1;0;0"
                keyTimes={`0;0.02;${((message.dur - 0.1) / CYCLE).toFixed(3)};${(message.dur / CYCLE).toFixed(3)};1`}
              />
            </circle>
          );
        })}
      </g>
      {Object.entries(NODES).map(([id, node]) => (
        <g
          key={id}
          transform={`translate(${node.x - W / 2} ${node.y - H / 2})`}
        >
          <rect
            width={W}
            height={H}
            rx={10}
            className="fill-background stroke-border"
          />
          <text
            x={12}
            y={19}
            className="fill-foreground font-sans text-[12px] font-medium"
          >
            {node.name}
          </text>
          <text
            x={12}
            y={34}
            className="fill-muted-foreground font-mono text-[10px]"
          >
            {node.state}
          </text>
        </g>
      ))}
    </svg>
  );
}
