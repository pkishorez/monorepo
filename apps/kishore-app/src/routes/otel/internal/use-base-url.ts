import { useCallback, useState } from 'react';

const STORAGE_KEY = 'kishore-app:otel:baseUrl';

export function useBaseUrl() {
  const [baseUrl, setBaseUrlState] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setBaseUrl = useCallback((next: string) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setBaseUrlState(next);
  }, []);

  return { baseUrl, setBaseUrl };
}

export function isValidBaseUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
