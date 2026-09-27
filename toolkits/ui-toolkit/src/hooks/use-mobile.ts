import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
const mobileQuery = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia(mobileQuery).matches,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(mobileQuery);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
