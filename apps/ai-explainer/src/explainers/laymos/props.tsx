import type { CSSProperties, ReactNode } from 'react';
import { Badge } from '@kstackz/ui-toolkit/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kstackz/ui-toolkit/components/ui/card';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kstackz/ui-toolkit/components/ui/alert';
import {
  Check,
  CircleX,
  GitPullRequest,
  MessageSquare,
} from '@kstackz/ui-toolkit/lucide';
import { ease, fps } from '../../foundation/canvas/index.ts';

// The laymos story's props, built from real kui components.

export const layers = [
  { id: 'ui', name: 'Interface', path: 'src/ui' },
  { id: 'features', name: 'Features', path: 'src/features' },
  { id: 'services', name: 'Services', path: 'src/services' },
] as const;

export function LayerCard({
  name,
  path,
  badge,
  className,
  style,
}: {
  name: string;
  path: string;
  badge?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Card size="sm" className={`w-64 ${className ?? ''}`} style={style}>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription className="font-mono text-xs">{path}</CardDescription>
        {badge && <CardAction>{badge}</CardAction>}
      </CardHeader>
    </Card>
  );
}

const keywords = /\b(import|from|export|function|const|return)\b/;

function Token({ text }: { text: string }) {
  const parts = text.split(
    /('[^']*'|"[^"]*"|\b(?:import|from|export|function|const|return)\b)/,
  );
  return (
    <>
      {parts.map((part, i) =>
        /^['"]/.test(part) ? (
          <span key={i} className="text-chart-8">
            {part}
          </span>
        ) : keywords.test(part) ? (
          <span key={i} className="text-chart-6">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export type CodeLine = { text: string; group?: string };

export const configLines: CodeLine[] = [
  { text: '{' },
  { text: '  "layers": {', group: 'layers' },
  { text: '    "ui":       ["src/ui"],', group: 'layers' },
  { text: '    "features": ["src/features"],', group: 'layers' },
  { text: '    "services": ["src/services"]', group: 'layers' },
  { text: '  },', group: 'layers' },
  { text: '  "modules": {', group: 'modules' },
  { text: '    "src/features/checkout": {},', group: 'modules' },
  { text: '    "src/features/search": {}', group: 'modules' },
  { text: '  },', group: 'modules' },
  { text: '  "rules": {', group: 'rules' },
  { text: '    "ui": ["features"],', group: 'rules' },
  { text: '    "features": ["services"]', group: 'rules' },
  { text: '  }', group: 'rules' },
  { text: '}' },
];

export const sourceLines: CodeLine[] = [
  { text: "import { Button } from '@kstackz/ui-toolkit/button';" },
  { text: "import { useCart } from '@/features/checkout';" },
  { text: "import { charge } from '@/services/payments';", group: 'bad' },
  { text: '' },
  { text: 'export function Checkout() {' },
  { text: '  const cart = useCart();' },
  { text: '  return <Button onClick={() => charge(cart)}>Pay</Button>;' },
  { text: '}' },
];

// A code file in a kui Card. `focus` dims every group but one; `marks` paints
// whole lines (by index) in a tone.
export function CodeCard({
  title,
  lines,
  focus,
  marks = {},
  reveal = 1,
  className,
}: {
  title?: string;
  lines: CodeLine[];
  focus?: string | null;
  marks?: Record<number, 'bad' | 'good' | 'focus'>;
  reveal?: number;
  className?: string;
}) {
  const body = (
    <div className="font-mono text-[13px] leading-6">
      {lines.map((line, i) => {
        const shown = i / lines.length < reveal;
        const dim = focus && line.group !== focus;
        const mark = marks[i];
        const text = line.text;
        return (
          <div
            key={i}
            className={`flex rounded-sm px-2 ${
              mark === 'bad'
                ? 'bg-destructive/10 text-destructive'
                : mark === 'good'
                  ? 'bg-positive/10'
                  : mark === 'focus' || (focus && !dim)
                    ? 'bg-muted'
                    : ''
            }`}
            style={{ opacity: shown ? (dim ? 0.28 : 1) : 0 }}
          >
            <span className="mr-4 w-5 shrink-0 text-right text-muted-foreground/60 select-none">
              {i + 1}
            </span>
            <span className="whitespace-pre">
              {mark === 'bad' ? text : <Token text={text} />}
            </span>
          </div>
        );
      })}
    </div>
  );
  return (
    <Card size="sm" className={`gap-3 ${className ?? ''}`}>
      {title && (
        <CardHeader className="border-b">
          <CardTitle className="font-mono text-xs text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="px-2">{body}</CardContent>
    </Card>
  );
}

export function LintAlert({ className }: { className?: string }) {
  return (
    <Alert
      variant="destructive"
      className={`w-[25rem] shadow-sm ${className ?? ''}`}
    >
      <CircleX />
      <AlertTitle>ui may not depend on services</AlertTitle>
      <AlertDescription className="font-mono text-xs">
        src/ui/checkout.tsx:3
      </AlertDescription>
    </Alert>
  );
}

export function ReviewCard({
  frame,
  enter,
  className,
}: {
  frame: number;
  enter: number;
  className?: string;
}) {
  const comments = [
    { who: 'Priya', text: 'Should search own its own module?' },
    { who: 'Sam', text: 'Agreed. Split it before it grows.' },
  ];
  return (
    <Card size="sm" className={`w-[26rem] ${className ?? ''}`}>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <GitPullRequest className="size-4 text-positive" />
          Split checkout into modules
        </CardTitle>
        <CardDescription>#214 · 6 files changed</CardDescription>
        <CardAction>
          <Badge
            variant="outline"
            style={{ opacity: ease(frame, enter + 1.8 * fps) }}
          >
            <Check className="text-positive" /> laymos
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="gap-3">
        {comments.map(({ who, text }, i) => {
          const t = ease(frame, enter + (0.6 + i * 0.7) * fps);
          return (
            <div
              key={who}
              className="flex gap-3"
              style={{
                opacity: t,
                transform: `translateY(${(1 - t) * 12}px)`,
              }}
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {who[0]}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{who}</span>
                  <MessageSquare className="size-3" />
                  <Badge variant="secondary">design</Badge>
                </div>
                <p className="mt-1">{text}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
