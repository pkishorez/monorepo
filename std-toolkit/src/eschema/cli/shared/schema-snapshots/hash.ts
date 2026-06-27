import { createHash } from 'node:crypto';

export function hashSnapshotContent(content: string): string {
  return `sha256-${createHash('sha256').update(content).digest('hex')}`;
}
