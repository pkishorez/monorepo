export function sql(
  strings: TemplateStringsArray,
  ...values: string[]
): string {
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += values[i];
    }
  }

  return result;
}

export function keyvalues(obj: Record<string, any>) {
  return {
    keys: keys(...Object.keys(obj)),
    setKeys: setKeys(...Object.keys(obj)),
    ...values(Object.values(obj)),
  };
}
export function keys(...keys: string[]) {
  return keys.join(', ');
}
export function setKeys(...keys: string[]) {
  return keys.map((key) => `${key} = ?`).join(`, `);
}
export function values(values: any[]) {
  return {
    placeholders: values.map(() => '?').join(', '),
    values,
  };
}
