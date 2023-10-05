import { animate, useMotionValue } from "framer-motion";
import { useEffect } from "react";

export const useAnimate = (value: number, applyTransition: boolean) => {
  const motionValue = useMotionValue(0);

  useEffect(() => {
    if (applyTransition) {
      animate(motionValue, value, {
        type: "tween",
        ease: "linear",
        duration: 0.3,
      });
    } else {
      motionValue.set(value);
    }
  }, [applyTransition, value, motionValue]);

  return motionValue;
};
