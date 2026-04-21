export const errorMessage = (e: unknown): string =>
  typeof e === 'object' &&
  e !== null &&
  'message' in e &&
  typeof (e as Record<string, unknown>).message === 'string'
    ? ((e as Record<string, unknown>).message as string)
    : String(e);
