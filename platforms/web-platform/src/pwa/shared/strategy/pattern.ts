const compiled = new Map<string, RegExp>();

/** Compiles a regex source once and reuses it; rules are matched per request. */
export const compilePattern = (source: string): RegExp => {
  let regExp = compiled.get(source);
  if (regExp === undefined) {
    regExp = new RegExp(source);
    compiled.set(source, regExp);
  }
  return regExp;
};

export const isValidPattern = (source: string): boolean => {
  try {
    compilePattern(source);
    return true;
  } catch {
    return false;
  }
};
