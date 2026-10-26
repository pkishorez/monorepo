import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { connect } from 'node:net';

/*
 * What a dev process shows and checks on its terminal's behalf: the shared
 * Connect's log, followed while it starts (a new branch's device sign-in
 * appears there), and whether Portless's proxy is up, since the detached
 * supervisor has no terminal to start it from.
 */

/** Copies what is added to `file` from `from` on to `out`, until the function returned is called. */
export const follow = (
  file: string,
  from: number = 0,
  out: NodeJS.WritableStream = process.stdout,
): (() => void) => {
  let offset = from;
  const buffer = Buffer.alloc(64 * 1024);
  const read = () => {
    let fd: number;
    try {
      fd = openSync(file, 'r');
    } catch {
      return;
    }
    try {
      for (;;) {
        const n = readSync(fd, buffer, 0, buffer.length, offset);
        if (n === 0) break;
        offset += n;
        out.write(buffer.subarray(0, n));
      }
    } finally {
      closeSync(fd);
    }
  };
  const timer = setInterval(read, 200);
  return () => {
    clearInterval(timer);
    read();
  };
};

/** The size of `file`, 0 when it is missing. */
export const sizeOf = (file: string): number => {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
};

/** Whether Portless's proxy accepts connections on the port `url` is served on. */
export const proxyUp = (url: string): Promise<boolean> => {
  const { port, protocol } = new URL(url);
  const at = port === '' ? (protocol === 'https:' ? 443 : 80) : Number(port);
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port: at });
    const done = (up: boolean) => {
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(2_000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
};
