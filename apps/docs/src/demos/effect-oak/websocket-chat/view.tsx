import type { ReactNode } from 'react';
import { View } from 'effect-oak/react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kstackz/web-platform/components/alert';
import { Button } from '@kstackz/web-platform/components/button';
import { ComposerView } from './composer/index.js';
import { Transcript } from './transcript/index.js';
import { Chat } from './websocket-chat.js';

const DOT = {
  red: 'bg-red-500',
  amber: 'animate-pulse bg-amber-500',
  green: 'bg-green-500',
};

/** The chat window: header with the connection, the messages, and a footer. */
const Window = ({
  dot,
  status,
  children,
  footer,
}: {
  readonly dot: keyof typeof DOT;
  readonly status: string;
  readonly children?: ReactNode;
  readonly footer: ReactNode;
}) => (
  <div className="flex size-full justify-center p-6">
    <div className="flex w-full max-w-xl flex-col rounded-xl border">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <div className="font-semibold">WebSocket chat</div>
          <div className="text-sm text-muted-foreground">Echo server demo</div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`size-2.5 rounded-full ${DOT[dot]}`} />
          {status}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">{children}</div>
      <div className="border-t p-4">{footer}</div>
    </div>
  </div>
);

export const ChatView = View.make(Chat, {
  Disconnected: ({ send }) => (
    <Window
      dot="red"
      status="Disconnected"
      footer={
        <Button
          className="w-full"
          onClick={() => send({ _tag: 'ClickedConnect' })}
        >
          Connect to chat
        </Button>
      }
    />
  ),
  Online: ({ state, children }) => (
    <Window
      dot={state.connected ? 'green' : 'amber'}
      status={state.connected ? 'Connected' : 'Connecting…'}
      footer={
        state.connected ? (
          <ComposerView node={children.composer} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Connecting…
          </p>
        )
      }
    >
      <Transcript messages={state.messages} />
    </Window>
  ),
  Error: ({ state, send }) => (
    <Window
      dot="red"
      status="Error"
      footer={
        <div className="flex flex-col gap-3">
          <Alert variant="destructive">
            <AlertTitle>Connection error</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
          <Button onClick={() => send({ _tag: 'ClickedConnect' })}>
            Try again
          </Button>
        </div>
      }
    />
  ),
});
