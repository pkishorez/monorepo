import { readFileSync } from 'node:fs';

export const repository = process.env.GITHUB_REPOSITORY ?? '';
const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';

export interface PullRequest {
  readonly number: number;
  readonly action: string;
}

export function pullRequest(): PullRequest {
  const event = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'),
  );
  if (event.pull_request === undefined) {
    throw new Error('Run on a pull_request event.');
  }
  return { number: event.pull_request.number, action: event.action };
}

export type GitHub = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<any>;

export function gitHub(token: string): GitHub {
  return async (method, path, body) => {
    const response = await fetch(`${api}/repos/${repository}${path}`, {
      method,
      headers: {
        ...headers(token),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return parse(response, `${method} ${path}`);
  };
}

export function headers(token: string) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  };
}

export async function parse(response: Response, request: string) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${request} failed with ${response.status}: ${text}`);
  }
  return text === '' ? undefined : JSON.parse(text);
}
