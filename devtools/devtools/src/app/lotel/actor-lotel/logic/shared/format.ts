export function formatSpanName(
  name: string,
  attributes: Record<string, unknown>,
): string {
  if (/^http\.(client|server)\s/.test(name)) {
    const path = attributes['url.path'];
    if (typeof path === 'string') return `${name} ${path}`;
  }
  return name;
}
