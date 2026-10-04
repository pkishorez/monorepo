declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** Whether the app runs in development, as bundlers set it. */
export const development = () =>
  typeof process === 'undefined' || process.env.NODE_ENV !== 'production';
