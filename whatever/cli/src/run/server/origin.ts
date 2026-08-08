const ALLOWED_DOMAINS = ['kishore.app'];

export const isAllowedOrigin = (origin: string): boolean => {
  try {
    const { hostname, protocol } = new URL(origin);
    return (
      protocol === 'https:' &&
      ALLOWED_DOMAINS.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
};
