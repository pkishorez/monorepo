import { Effect } from 'effect';

/** A Device Login waiting to be approved: the Device Screen link, the code
 * it shows, and how eagerly to open it. */
export interface PendingLogin {
  readonly url: string;
  readonly code: string;
  readonly open: 'prompt' | 'auto';
}

/** Shows a pending Device Login to the User. Runs while the Device polls and
 * is interrupted once the login ends, so a prompt may wait forever. */
export type Show = (login: PendingLogin) => Effect.Effect<void>;

/** What showing a login in a terminal needs. */
export interface Terminal {
  readonly print: (line: string) => void;
  /** Whether a person is at the terminal to press a key. */
  readonly interactive: boolean;
  /** Calls `onKey` for each key pressed, one at a time; answers how to stop
   * listening and put the terminal back. */
  readonly listen: (onKey: (key: string) => void) => () => void;
  /** Opens `url` in the default browser. */
  readonly launch: (url: string) => void;
}

/** Shows a login in a terminal: the link and code always; then with a
 * person there, `'auto'` opens the browser at once and `'prompt'` opens it
 * when `o` is pressed. */
export const showIn =
  (terminal: Terminal): Show =>
  ({ url, code, open }) =>
    Effect.gen(function* () {
      terminal.print(`To sign in, open ${url}`);
      terminal.print(`and check it shows the code ${code}.`);
      if (!terminal.interactive) return;
      if (open === 'auto') {
        terminal.launch(url);
        return;
      }
      terminal.print('Press o to open it in your browser.');
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          terminal.listen((key) => {
            if (key.toLowerCase() === 'o') terminal.launch(url);
          }),
        ),
        (stop) => Effect.sync(stop),
      );
      return yield* Effect.never;
    }).pipe(Effect.scoped);

const launchCommand = (url: string): [string, string[]] =>
  process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];

/** The terminal this process runs in. Node modules load only when a
 * browser is opened, so a Device without Node can still import this. */
export const processTerminal = (): Terminal => ({
  print: (line) => process.stderr.write(`${line}\n`),
  interactive: Boolean(process.stdin.isTTY && process.stderr.isTTY),
  listen: (onKey) => {
    const { stdin } = process;
    const wasRaw = stdin.isRaw;
    const onData = (data: Buffer | string) => {
      const key = data.toString();
      // Raw mode swallows Ctrl-C; pass it on.
      if (key === '\u0003') {
        stop();
        process.kill(process.pid, 'SIGINT');
        return;
      }
      onKey(key);
    };
    const stop = () => {
      stdin.off('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    };
    stdin.setRawMode(true);
    stdin.on('data', onData);
    stdin.resume();
    return stop;
  },
  launch: (url) => {
    const [file, args] = launchCommand(url);
    void import('node:child_process').then(
      ({ spawn }) =>
        spawn(file, args, { detached: true, stdio: 'ignore' })
          .on('error', () => undefined)
          .unref(),
      () => undefined,
    );
  },
});
