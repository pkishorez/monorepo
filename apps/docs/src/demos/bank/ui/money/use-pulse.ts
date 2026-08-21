import { useRef } from 'react';

export function usePulseKey(value: number): number {
  const previous = useRef(value);
  const key = useRef(0);
  if (previous.current !== value) {
    previous.current = value;
    key.current += 1;
  }
  return key.current;
}
