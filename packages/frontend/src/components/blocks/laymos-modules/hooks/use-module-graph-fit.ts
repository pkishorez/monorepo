import { useReactFlow } from '@xyflow/react';
import { useEffect, useState, type RefObject } from 'react';

/** Fits stable module geometry when its host or expansion state changes. */
export function useModuleGraphFit(
  ref: RefObject<HTMLElement | null>,
  geometryKey: string,
  fitEnabled = true,
): boolean {
  const { fitView } = useReactFlow();
  const [fitted, setFitted] = useState(!fitEnabled);
  useEffect(() => {
    if (!fitEnabled) {
      setFitted(true);
      return;
    }
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const fit = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void fitView({ padding: 0.16 });
        setFitted(true);
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitEnabled, fitView, geometryKey, ref]);
  return fitted;
}
