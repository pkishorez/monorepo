import { appendFileSync } from 'node:fs';

export function input(name: string): string {
  return (process.env[`INPUT_${name.toUpperCase()}`] ?? '').trim();
}

export function choice<const T extends string>(
  name: string,
  choices: readonly [T, ...T[]],
): T {
  const value = input(name);
  const match = choices.find((option) => option === (value || choices[0]));
  if (match === undefined) {
    throw new Error(
      `${name} must be one of ${choices.join(', ')}; got '${value}'.`,
    );
  }
  return match;
}

export function flag(name: string): boolean {
  return choice(name, ['true', 'false']) === 'true';
}

export function setOutputs(outputs: Readonly<Record<string, string>>) {
  for (const [name, value] of Object.entries(outputs)) {
    const delimiter = `output-${Math.random().toString(36).slice(2)}`;
    appendFileSync(
      process.env.GITHUB_OUTPUT ?? '/dev/null',
      `${name}<<${delimiter}\n${value}\n${delimiter}\n`,
    );
  }
}

export function run(main: () => Promise<void>) {
  main().catch((error: unknown) => {
    console.log(
      `::error::${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
