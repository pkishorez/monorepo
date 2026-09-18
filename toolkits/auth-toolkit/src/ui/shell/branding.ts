import type { CSSProperties } from 'react';

/** Mirrors the worker door's `Branding`; the ui layer cannot import it. */
export interface Branding {
  appName: string | { name: string; style?: CSSProperties | undefined };
  logoUrl?:
    | string
    | { url: string; style?: CSSProperties | undefined }
    | undefined;
}

export const brandName = ({ appName }: Branding) =>
  typeof appName === 'string' ? appName : appName.name;

export const brandLogo = ({ logoUrl }: Branding) =>
  typeof logoUrl === 'string' ? { url: logoUrl } : logoUrl;
