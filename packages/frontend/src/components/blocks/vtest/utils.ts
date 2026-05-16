import matter from 'gray-matter';

import type { FileNode } from '@monorepo/vtest/types';

export const formatDuration = (ms: number | undefined): string => {
  if (ms === undefined) return '';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export type ParsedDoc = {
  title?: string;
  body: string;
};

export const parseDoc = (raw: string | undefined): ParsedDoc => {
  if (!raw) return { body: '' };
  try {
    const { data, content } = matter(raw);
    const title = typeof data.title === 'string' ? data.title : undefined;
    return { ...(title !== undefined && { title }), body: content };
  } catch {
    return { body: raw };
  }
};

export const deriveTitle = (file: FileNode): string => {
  const parsed = parseDoc(file.doc);
  if (parsed.title) return parsed.title;
  const h1 = /^#\s+(.+)$/m.exec(parsed.body);
  if (h1?.[1]) return h1[1].trim();
  return file.name;
};

// PageHeader already shows the file title — strip a leading `# title` from
// the doc body so it isn't rendered twice.
export const stripLeadingH1 = (raw: string | undefined): string => {
  if (!raw) return '';
  const { body } = parseDoc(raw);
  return body.replace(/^\s*#\s+[^\n]*\n+/, '');
};
