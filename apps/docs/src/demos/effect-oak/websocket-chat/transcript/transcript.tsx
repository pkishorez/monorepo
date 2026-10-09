type ChatMessage = {
  readonly text: string;
  /** Wall-clock milliseconds, for the time under the bubble. */
  readonly sentAt: number;
  readonly isSent: boolean;
};

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The conversation so far: sent messages on the right, echoes on the left. */
export const Transcript = ({
  messages,
}: {
  readonly messages: ReadonlyArray<ChatMessage>;
}) =>
  messages.length === 0 ? (
    <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
      <p>No messages yet</p>
      <p className="text-sm">Send a message to get started!</p>
    </div>
  ) : (
    <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
      {messages.map((message, index) => (
        <li
          key={index}
          className={message.isSent ? 'flex justify-end' : 'flex justify-start'}
        >
          <div
            className={`max-w-xs rounded-lg px-3 py-2 ${
              message.isSent ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            <p className="break-words">{message.text}</p>
            <p className="mt-1 text-xs opacity-70">
              {TIME.format(message.sentAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
