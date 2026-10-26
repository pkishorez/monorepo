import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/*
 * Which branch a dev run is, as Portless names it. Portless puts a prefix
 * in front of a host only in a linked git worktree (the last part of its
 * branch, made host-safe), so the main checkout is always `main`, and the
 * prefix names a worktree's own folders, Connection and Cloud Connect.
 */

/** A dev run's branch: its folder slug, and its Cloud Connect's URL. */
export interface Branch {
  readonly slug: string;
  readonly cloud: string;
}

const NAME = 'connect.kishore';

/** The branch `url`, Portless's URL for `name`, belongs to; throws when it is not one of `name`'s. */
export const slugOf = (url: string, name: string = NAME): string => {
  const { hostname } = new URL(url);
  const at = hostname.indexOf(`${name}.`);
  if (at === -1 || hostname.slice(at + name.length + 1).includes('.'))
    throw new Error(`${url} is not a Portless URL for ${name}`);
  return at === 0 ? 'main' : hostname.slice(0, at - 1);
};

/** The branch the checkout at `cwd` is, asking Portless for Cloud Connect's URL there. */
export const branchOf = async (cwd: string): Promise<Branch> => {
  const { stdout } = await promisify(execFile)('portless', ['get', NAME], {
    cwd,
  });
  const cloud = stdout.trim();
  return { slug: slugOf(cloud), cloud };
};
