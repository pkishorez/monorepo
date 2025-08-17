import { useRef } from "react";

export function useLiveRef<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;

  return ref;
}
