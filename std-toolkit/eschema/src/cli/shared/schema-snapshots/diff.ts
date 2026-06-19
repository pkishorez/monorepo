import kleur from 'kleur';

export function formatUnifiedDiff(
  expectedLabel: string,
  expected: string,
  actualLabel: string,
  actual: string,
): string {
  const expectedLines = toLines(expected);
  const actualLines = toLines(actual);
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  const lines = [
    kleur.dim(`--- ${expectedLabel}`),
    kleur.dim(`+++ ${actualLabel}`),
    kleur.cyan(`@@ -1,${expectedLines.length} +1,${actualLines.length} @@`),
  ];

  for (let index = 0; index < maxLines; index++) {
    const expectedLine = expectedLines[index];
    const actualLine = actualLines[index];
    if (expectedLine === actualLine && expectedLine !== undefined) {
      lines.push(` ${expectedLine}`);
    } else {
      if (expectedLine !== undefined) {
        lines.push(kleur.red(`-${expectedLine}`));
      }
      if (actualLine !== undefined) {
        lines.push(kleur.green(`+${actualLine}`));
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

function toLines(content: string): string[] {
  const lines = content.split('\n');
  if (lines.at(-1) === '') {
    return lines.slice(0, -1);
  }
  return lines;
}
