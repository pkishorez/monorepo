export function inputContentPadding(width: number, present: boolean): number | undefined {
  return present && width > 0 && Number.isFinite(width) ? width : undefined;
}
