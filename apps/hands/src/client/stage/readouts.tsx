import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { HandReading } from '../../shared/gestures/index.ts';
import { latest, subscribe } from '../tracker/index.ts';
import type { Snapshot } from '../tracker/index.ts';
import { HAND_COLOR } from './draw.ts';

/*
 * The numbers behind the stage, a few times a second: how fast the model
 * runs, and what each hand reads as. It is what to look at when a gesture
 * does not fire: how far apart the pinch is, which fingers count as out.
 */

const EVERY = 150;

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    let last = 0;
    const unsubscribe = subscribe(() => {
      const now = performance.now();
      const next = latest();
      if (next !== null && now - last < EVERY) return;
      last = now;
      setSnapshot(next);
    });
    return unsubscribe;
  }, []);
  return snapshot;
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-[13px] tabular-nums">{children}</dd>
    </div>
  );
}

function Hand({ hand }: { readonly hand: HandReading }) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span
          className="grid size-6 place-items-center rounded-full text-xs text-black"
          style={{ background: HAND_COLOR[hand.id] }}
        >
          {hand.id}
        </span>
        Hand {hand.id}
        <span className="font-normal text-muted-foreground">
          · MediaPipe says {hand.handedness.label} (
          {Math.round(hand.handedness.score * 100)}%)
        </span>
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Fact label="Shape">
          {hand.shape.name} {Math.round(hand.shape.score * 100)}%
        </Fact>
        <Fact label="Fingers out">{hand.count}</Fact>
        <Fact label="Thumb–index">
          {hand.pinch.mm.toFixed(0)} mm{hand.pinch.down ? ' · pinched' : ''}
        </Fact>
        <Fact label="Thumb–middle">
          {hand.middlePinch.mm.toFixed(0)} mm
          {hand.middlePinch.down ? ' · pinched' : ''}
        </Fact>
        <Fact label="Turned">{hand.roll.toFixed(0)}°</Fact>
        <Fact label="Size">{(hand.size * 100).toFixed(1)}%</Fact>
        <Fact label="Depth (z, index)">{hand.points[8]!.z.toFixed(3)}</Fact>
        <Fact label="Drawing">{hand.drawing ? 'yes' : 'no'}</Fact>
      </dl>
      <ul className="flex flex-wrap gap-1.5">
        {FINGERS.map((name, i) => (
          <li
            key={name}
            className={`rounded-md px-2 py-0.5 text-xs ${hand.fingers[i] ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
          >
            {name}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Readouts() {
  const snapshot = useSnapshot();
  if (snapshot === null) return null;
  const { reading } = snapshot;
  return (
    <div className="space-y-3">
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <Fact label="Runs on">{snapshot.delegate}</Fact>
        <Fact label="Frames a second">{snapshot.fps.toFixed(0)}</Fact>
        <Fact label="Model time">{snapshot.ms.toFixed(1)} ms</Fact>
        <Fact label="Hands">{reading.hands.length}</Fact>
        {reading.twoHands && (
          <Fact label="Both hands">
            {reading.twoHands.scale.toFixed(2)}× ·{' '}
            {reading.twoHands.rotation.toFixed(0)}°
          </Fact>
        )}
      </dl>
      {reading.hands.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hands in view. Raise one in front of the camera.
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {reading.hands.map((hand) => (
            <Hand key={hand.id} hand={hand} />
          ))}
        </div>
      )}
    </div>
  );
}
