export function extractKeys(pattern: string): string[] {
  const matches = pattern.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

export function hasVariable(pattern: string): boolean {
  return pattern.includes("{");
}
