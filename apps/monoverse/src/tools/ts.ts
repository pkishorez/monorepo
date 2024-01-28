export const removeUndefined = <T>(obj: T): T => {
  const result = { ...obj };

  for (const key in result) {
    const value = result[key];
    if (value === undefined) {
      delete result[key];
    }
  }

  return result;
};
