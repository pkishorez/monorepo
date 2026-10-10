import type { CSSProperties, ReactNode } from 'react';
import { ease, fps, glide, mix } from '../../foundation/canvas/index.ts';
import { hue, useStyle } from '../../foundation/style/index.ts';

// Small drawings for the ideas in Going deeper that have no clip of their
// own. Each is `plateWidth` wide and drawn from the frame alone.

export const plateWidth = 1150;

function Surface({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`border ${className ?? ''}`}
      style={{
        background: 'var(--surface)',
        color: 'var(--surface-ink)',
        borderColor: 'var(--surface-line)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--surface-shadow)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Mono({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const style = useStyle();
  return (
    <span
      style={{
        fontFamily: style.font.mono,
        color: muted ? 'var(--surface-muted)' : undefined,
      }}
    >
      {children}
    </span>
  );
}

// The plate's topic, written on the board above it.
export function PlateTitle({
  title,
  frame,
  enter,
  chapter,
}: {
  title: string;
  frame: number;
  enter: number;
  chapter: number;
}) {
  const style = useStyle();
  const t = ease(frame, enter, 0.6);
  const bold = style.name === 'bold';
  return (
    <div
      className="leading-none whitespace-nowrap"
      style={{
        opacity: t,
        transform: `translateY(${mix(10, 0, t)}px)`,
        fontFamily: style.font.label,
        fontSize: bold ? 84 : 60,
        fontWeight: bold ? 800 : style.name === 'blueprint' ? 500 : 600,
        letterSpacing: bold ? '-0.045em' : '-0.02em',
        color: bold ? hue(style, chapter) : undefined,
      }}
    >
      {title}
    </div>
  );
}

// Two Lifetimes against a rocket's States: one spans the whole Instance, one
// only the State it belongs to.
export function Lifetimes({
  frame,
  enter,
  state,
}: {
  frame: number;
  enter: number;
  state: number;
}) {
  const style = useStyle();
  const accent = hue(style, 0);
  const states = [
    { name: 'OnPad', share: 0.3 },
    { name: 'InFlight', share: 0.4 },
    { name: 'Landed', share: 0.3 },
  ];
  const whole = ease(frame, enter + 0.25 * fps, 1.4, glide);
  const one = ease(frame, state, 0.9, glide);
  const track = 1150 - 2 * 48;
  return (
    <Surface className="flex flex-col gap-9 p-12 text-[26px]">
      <div className="flex">
        {states.map(({ name, share }, i) => (
          <div
            key={name}
            className="border-l-2 pl-4"
            style={{
              width: track * share,
              borderColor: 'var(--surface-line)',
              opacity: i === 1 ? mix(0.7, 1, one) : 0.7,
            }}
          >
            <Mono muted={i !== 1}>{name}</Mono>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between">
          <span className="font-medium">Instance Lifetime</span>
          <Mono muted>{"'*'"}</Mono>
        </div>
        <div
          className="h-5 rounded-full"
          style={{ width: track * whole, background: accent }}
        />
      </div>
      <div
        className="flex flex-col gap-3"
        style={{ opacity: mix(0.25, 1, one) }}
      >
        <div className="flex justify-between">
          <span className="font-medium">State Lifetime</span>
          <Mono muted>InFlight</Mono>
        </div>
        <div
          className="h-5 rounded-full"
          style={{
            marginLeft: track * 0.3,
            width: track * 0.4 * one,
            background: accent,
            opacity: 0.75,
          }}
        />
      </div>
    </Surface>
  );
}

function Node({
  name,
  lit,
  dim,
  width = 230,
}: {
  name: string;
  lit: number;
  dim: number;
  width?: number;
}) {
  const style = useStyle();
  const accent = hue(style, 0);
  return (
    <div
      className="flex h-[88px] flex-col items-center justify-center gap-1 border-2 text-[26px] font-medium"
      style={{
        width,
        background: 'var(--surface)',
        color: 'var(--surface-ink)',
        borderRadius: 'var(--radius-card)',
        borderColor: `color-mix(in oklab, ${accent} ${lit * 100}%, var(--surface-line))`,
        boxShadow:
          lit > 0
            ? `0 0 0 ${6 * lit}px color-mix(in oklab, ${accent} 22%, transparent)`
            : undefined,
        opacity: mix(1, 0.45, dim),
      }}
    >
      {name}
      <span
        className="text-[18px]"
        style={{ fontFamily: style.font.mono, color: accent, opacity: lit }}
      >
        renders
      </span>
    </div>
  );
}

// A Message lands on one Rocket; only that Rocket's View renders again.
export function Rendering({
  frame,
  send,
  only,
}: {
  frame: number;
  send: number;
  only: number;
}) {
  const style = useStyle();
  const accent = hue(style, 0);
  const travel = ease(frame, send, 0.8, glide);
  const lit = ease(frame, send + 0.8 * fps, 0.35);
  const dim = ease(frame, only, 0.6);
  const line = 'var(--surface-line)';
  return (
    <div className="relative flex h-[560px] w-[1150px] flex-col items-center gap-[120px] pt-6">
      <svg className="absolute inset-0" width={1150} height={560}>
        {[195, 575, 955].map((x) => (
          <path
            key={x}
            d={`M 575 120 C 575 170, ${x} 160, ${x} 230`}
            stroke={line}
            strokeWidth={3}
            fill="none"
          />
        ))}
      </svg>
      <Node name="LaunchSite" lit={0} dim={dim} width={300} />
      <div className="flex w-full justify-between px-[80px]">
        {['R-1', 'R-2', 'R-3'].map((name, i) => (
          <Node
            key={name}
            name={`Rocket ${name}`}
            lit={i === 1 ? lit : 0}
            dim={i === 1 ? 0 : dim}
          />
        ))}
      </div>
      <div
        className="absolute rounded-full px-5 py-2 text-[24px] font-medium"
        style={{
          left: mix(860, 500, travel),
          top: mix(470, 370, travel),
          opacity: travel > 0 && travel < 1 ? 1 : 0,
          background: accent,
          color: style.name === 'paper' ? 'white' : 'var(--background)',
          fontFamily: style.font.mono,
        }}
      >
        Fuel
      </div>
    </div>
  );
}

const log = ['Built', 'Fuel', 'Fuel', 'Launch', 'Cleared', 'Burned', 'Burned'];

// The Log's Messages fold into the app again; effects are skipped while
// Replaying, and Lifetimes start once it is done.
export function Replay({
  frame,
  enter,
  skip,
  live,
}: {
  frame: number;
  enter: number;
  skip: number;
  live: number;
}) {
  const style = useStyle();
  const accent = hue(style, 0);
  const cursor = ease(frame, enter + 0.3 * fps, 2, glide) * log.length;
  const skipped = ease(frame, skip, 0.5);
  const started = ease(frame, live, 0.5);
  return (
    <div className="flex w-[1150px] items-center gap-12">
      <Surface className="flex w-[420px] flex-col gap-2 p-7 text-[24px]">
        <div
          className="mb-2 text-[20px] tracking-[0.14em] uppercase"
          style={{ color: 'var(--surface-muted)' }}
        >
          Log
        </div>
        {log.map((message, i) => (
          <div
            key={i}
            className="flex items-center gap-4"
            style={{ opacity: cursor > i ? 1 : 0.4 }}
          >
            <span
              className="size-2.5 rounded-full"
              style={{
                background: cursor > i ? accent : 'var(--surface-line)',
              }}
            />
            <Mono>{message}</Mono>
          </div>
        ))}
      </Surface>
      <div className="flex flex-1 flex-col gap-6">
        <Surface className="flex flex-col gap-4 p-7 text-[26px]">
          <div className="flex items-center justify-between">
            <span className="font-medium">Rocket R-1</span>
            <Mono muted>{cursor >= log.length ? 'InFlight' : 'OnPad'}</Mono>
          </div>
          <div
            className="flex items-center justify-between"
            style={{ opacity: mix(1, 0.5, skipped) }}
          >
            <Mono muted>Command</Mono>
            <span
              className="text-[22px]"
              style={{ opacity: skipped, fontFamily: style.font.mono }}
            >
              skipped
            </span>
          </div>
          <div className="flex items-center justify-between">
            <Mono muted>Lifetime</Mono>
            <span
              className="flex items-center gap-2 text-[22px]"
              style={{
                fontFamily: style.font.mono,
                color: accent,
                opacity: started,
              }}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ background: accent }}
              />
              running
            </span>
          </div>
        </Surface>
      </div>
    </div>
  );
}
