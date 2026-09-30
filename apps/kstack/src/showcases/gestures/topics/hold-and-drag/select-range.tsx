import { useGesture } from '@kstackz/use-gesture/core';
import { useRef, useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const ROWS = 7;
const ROW_HEIGHT = 40;
// How far the held finger may drift and still count as holding.
const SLOP = 10;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Rows to select. One finger holds a row still; a second finger then drags
 * over the others, and every row between the two is selected.
 */
export function SelectRange() {
  const list = useRef<HTMLUListElement>(null);
  const stop = useRef<() => void>(undefined);
  const [held, setHeld] = useState<number>();
  const [anchor, setAnchor] = useState<number>();
  const [to, setTo] = useState<number>();
  const selected =
    anchor === undefined || to === undefined ? 0 : Math.abs(to - anchor) + 1;
  useStageStatus(
    held !== undefined && to === undefined
      ? `Holding row ${held + 1}`
      : selected > 0
        ? `${selected} selected${held !== undefined ? ` · holding row ${held + 1}` : ''}`
        : undefined,
  );

  const rowAt = (y: number) => {
    const top = list.current!.getBoundingClientRect().top;
    return clamp(Math.floor((y - top) / ROW_HEIGHT), 0, ROWS - 1);
  };

  useGesture({
    // A touch on the list is the hold's, whichever way it trembles.
    captures: (point) => {
      const box = list.current?.getBoundingClientRect();
      return (
        box !== undefined &&
        point.x >= box.left &&
        point.x <= box.right &&
        point.y >= box.top &&
        point.y <= box.bottom
      );
    },
    onStart: (pointers) => {
      const [first] = pointers.values();
      setTo(undefined);
      setAnchor(undefined);
      if (first === undefined || !list.current?.contains(first.target)) return;
      const row = rowAt(first.start.y);
      setHeld(row);
      setAnchor(row);
      // Moving the first finger before a second lands is not a hold.
      const drift = () => {
        if (Math.hypot(first.dx.get(), first.dy.get()) > SLOP) {
          stop.current?.();
          setHeld(undefined);
        }
      };
      const offs = [first.dx.on('change', drift), first.dy.on('change', drift)];
      stop.current = () => offs.forEach((off) => off());
    },
    onPointer: (pointer, pointers) => {
      if (pointer.end !== undefined || pointers.size !== 2) return;
      if (held === undefined) return;
      stop.current?.();
      const follow = () => setTo(rowAt(pointer.y.get()));
      follow();
      const off = pointer.y.on('change', follow);
      stop.current = off;
    },
    onEnd: () => {
      stop.current?.();
      stop.current = undefined;
      setHeld(undefined);
    },
  });

  const isSelected = (row: number) =>
    anchor !== undefined &&
    to !== undefined &&
    row >= Math.min(anchor, to) &&
    row <= Math.max(anchor, to);

  return (
    <div className="absolute inset-0 grid place-items-center">
      <ul ref={list} className="w-full max-w-sm px-4">
        {Array.from({ length: ROWS }, (_, row) => (
          <li
            key={row}
            data-selected={isSelected(row) ? '' : undefined}
            data-held={held === row ? '' : undefined}
            className="flex items-center rounded-md px-3 text-sm transition-colors duration-100 data-held:ring-2 data-held:ring-primary data-selected:bg-primary/15"
            style={{ height: ROW_HEIGHT }}
          >
            Row {row + 1}
          </li>
        ))}
      </ul>
    </div>
  );
}
