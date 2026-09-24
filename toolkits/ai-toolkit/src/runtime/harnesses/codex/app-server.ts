import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

export class CodexAppServer {
  readonly #process: ChildProcessWithoutNullStreams;
  readonly #pending = new Map<number, PendingCall>();
  #nextId = 1;
  #closed = false;

  constructor(cwd: string, command: string) {
    this.#process = spawn(command, ['app-server', '--stdio'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#process.stderr.resume();
    this.#process.once('error', (error) => this.#fail(error));
    void this.#read();
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      clientInfo: { name: 'ai-toolkit', title: 'AI Toolkit', version: '0.0.1' },
      capabilities: { experimentalApi: true },
    });
    this.#write({ method: 'initialized', params: {} });
  }

  request(method: string, params: unknown = {}): Promise<unknown> {
    const id = this.#nextId++;
    this.#write({ id, method, params });
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#process.kill();
    this.#fail(new Error('Codex app-server closed'));
  }

  #write(value: unknown): void {
    this.#process.stdin.write(`${JSON.stringify(value)}\n`);
  }

  async #read(): Promise<void> {
    try {
      for await (const line of createInterface({
        input: this.#process.stdout,
      })) {
        const value: unknown = JSON.parse(line);
        if (typeof value !== 'object' || value === null || !('id' in value)) {
          continue;
        }
        const id = value.id;
        if (typeof id !== 'number') continue;
        const pending = this.#pending.get(id);
        if (pending === undefined) continue;
        this.#pending.delete(id);
        if ('error' in value && value.error !== undefined) {
          pending.reject(new Error(JSON.stringify(value.error)));
        } else {
          pending.resolve('result' in value ? value.result : undefined);
        }
      }
      if (!this.#closed) this.#fail(new Error('Codex app-server exited'));
    } catch (cause) {
      this.#fail(cause);
    }
  }

  #fail(cause: unknown): void {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}
