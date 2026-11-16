import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Platform } from '../platform/index.ts';

/*
 * The build's last step: the module the plugin built for it is run here,
 * in Node, and what it draws is written beside the client's files: each
 * page's HTML at its URL, the App Shell, and each static place's answer in
 * the Static Data. Then the platform's host is told what it must know of them, as
 * lines in a file of its own, such as Cloudflare's `_headers`.
 */

/** What the built module default-exports: `prerender({ app, server, build })`. */
type Run = (
  write: (file: string, body: string) => Promise<void>,
  env: unknown,
) => Promise<{ readonly pages: ReadonlyArray<string>; readonly data: number }>;

/** Runs the built module, writing each file it draws under `outDir`. */
export const draw = async (module: string, outDir: string) => {
  // A module is kept by its URL: a second build in one process runs its own.
  const loaded = (await import(
    `${pathToFileURL(module).href}?built=${Date.now()}`
  ).catch((cause: unknown) => {
    // The app's own code ran, and failed, before anything was drawn.
    throw new Error(
      '[@kestack/kabuki/start] the build runs the app to draw its static pages, and the app failed as its modules loaded. What only a deploy or a browser has, read it when a Layer is built, never as a module loads.',
      { cause },
    );
  })) as { readonly default: Run };
  const run = loaded.default;
  return run(async (file, body) => {
    const at = path.join(outDir, file);
    await mkdir(path.dirname(at), { recursive: true });
    await writeFile(at, body);
  }, process.env);
};

const BEGIN = '# kabuki start: begin';
const END = '# kabuki start: end';

/** A host's file with Start's lines in it: its own block, written again by each build, the rest as it was. */
export const withLines = (existing: string | undefined, lines: string) => {
  const text = existing ?? '';
  const begin = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  const own =
    begin < 0 || end < begin
      ? text
      : text.slice(0, begin) + text.slice(end + END.length).replace(/^\n/, '');
  const head = own.length === 0 || own.endsWith('\n') ? own : `${own}\n`;
  return `${head}${BEGIN}\n${lines}\n${END}\n`;
};

/** Tells the platform's host of the files the build wrote: each of its files gets Start's lines. */
export const tellHost = async (
  platform: Platform,
  outDir: string,
  data: string,
) => {
  for (const [file, lines] of Object.entries(
    platform.files?.({ data }) ?? {},
  )) {
    const at = path.join(outDir, file);
    await writeFile(
      at,
      withLines(existsSync(at) ? readFileSync(at, 'utf8') : undefined, lines),
    );
  }
};
