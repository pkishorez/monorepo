import { createContext, type ReactNode, useState } from 'react';

/** Sets the line under the demo. */
export const StatusContext = createContext<(text: string | undefined) => void>(
  () => {},
);

/** Holds the line a demo says about itself, and shows it through `children`. */
export function StatusProvider(props: {
  readonly children: (status: string | undefined) => ReactNode;
}) {
  const [status, setStatus] = useState<string>();
  return (
    <StatusContext value={setStatus}>{props.children(status)}</StatusContext>
  );
}
