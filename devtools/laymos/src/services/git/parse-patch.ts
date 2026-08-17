import type { DiffHunk, DiffLine } from '../../change-set-schema/index.js';

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parsePatch(patch: string): readonly DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let lines: DiffLine[] = [];
  let oldNumber = 0;
  let newNumber = 0;

  const commit = () => {
    if (hunks.length > 0) {
      hunks[hunks.length - 1] = {
        ...(hunks[hunks.length - 1] as DiffHunk),
        lines,
      };
    }
  };

  for (const raw of patch.split('\n')) {
    const header = hunkHeader.exec(raw);
    if (header !== null) {
      commit();
      lines = [];
      oldNumber = Number(header[1]);
      newNumber = Number(header[2]);
      hunks.push({
        header: raw,
        oldStart: oldNumber,
        newStart: newNumber,
        lines,
      });
      continue;
    }
    if (hunks.length === 0 || raw.startsWith('\\')) continue;

    const content = raw.slice(1);
    switch (raw.charAt(0)) {
      case '+':
        lines.push({ kind: 'added', content, newNumber });
        newNumber += 1;
        break;
      case '-':
        lines.push({ kind: 'removed', content, oldNumber });
        oldNumber += 1;
        break;
      case ' ':
        lines.push({ kind: 'context', content, oldNumber, newNumber });
        oldNumber += 1;
        newNumber += 1;
        break;
      default:
        break;
    }
  }
  commit();
  return hunks.filter(({ lines: hunkLines }) => hunkLines.length > 0);
}
