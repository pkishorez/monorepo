const partsOf = (version: string) => {
  const [core = '', pre] = version.trim().replace(/^v/, '').split('-', 2);
  return {
    numbers: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
    pre: pre !== undefined,
  };
};

const olderThan = (version: string, than: string) => {
  const a = partsOf(version);
  const b = partsOf(than);
  for (let at = 0; at < Math.max(a.numbers.length, b.numbers.length); at++) {
    const x = a.numbers[at] ?? 0;
    const y = b.numbers[at] ?? 0;
    if (x !== y) return x < y;
  }
  return a.pre && !b.pre;
};

export const belowMinimum = (version: string, minConnect: string | null) =>
  minConnect !== null && olderThan(version, minConnect);

export const outdatedLine = (
  version: string | null,
  minConnect: string | null,
): string | null =>
  minConnect === null ||
  (version !== null && !belowMinimum(version, minConnect))
    ? null
    : `${version === null ? 'This ke-connect' : `ke-connect ${version}`} is older than Connect Cloud accepts (${minConnect}): run \`npm i -g @kestack/connect@latest\`, then start it again.`;
