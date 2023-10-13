import { motion, transform, useMotionValue } from "framer-motion";
import { useEffect, useRef } from "react";
import sliderImage from "./assets/slider-button.png";

interface Props {
  initialValue: number;
  onUpdate: (value: number) => void;
}
export const Slider = ({ initialValue, onUpdate }: Props) => {
  const minutes = 60;

  const path = Array.from({ length: minutes / 2 + 1 })
    .fill(0)
    .map((_, i) => {
      if (i == 0) {
        return "M 1 0 l 0 10 m 0 -10";
      }
      if (i % 5 == 0) {
        return "m 5 0 l 0 10 m 0 -10";
      }
      return "m 5 0 l 0 5 m 0 -5";
    });

  const constraintRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  const [left, right, loaded] = (() => {
    const { width } = constraintRef.current?.getBoundingClientRect?.() ?? {};
    console.log({ current: constraintRef.current });
    if (!width) return [0, 0, false];
    return [0, width, true];
  })();

  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;

  useEffect(() => {
    const listener = x.on("change", (v) => {
      updateRef.current(Math.round(transform(v, [left, right], [0, minutes])));
    });
    x.set(transform(initialValue, [0, minutes], [left, right]));

    return listener;
  }, [initialValue, left, right, x]);

  return (
    <div className="flex flex-col gap-y-2">
      <div
        className={"rounded-2xl bg-[#111] h-[10px] " + "relative"}
        style={{
          boxShadow: "0px 4px 2px 0px rgba(0, 0, 0, 0.60) inset",
        }}
      >
        <div
          className="absolute left-[7px] right-[6px] top-1/2"
          ref={constraintRef}
        >
          {loaded && (
            <motion.div
              drag="x"
              style={{ x }}
              transition={{
                type: "spring",
                damping: 20,
                stiffness: 300,
              }}
              className="absolute"
              dragConstraints={{ left, right }}
            >
              <img
                src={sliderImage}
                className="absolute left-0 -translate-x-1/2 -translate-y-1/2"
                draggable="false"
                style={{
                  minWidth: 80,
                }}
              />
            </motion.div>
          )}
        </div>
      </div>
      <div className="mx-1">
        <svg viewBox={`0 0 ${(minutes / 2) * 5 + 2} 10`}>
          <path d={path.join(",")} stroke="#6E6E6E" strokeWidth={1} />
        </svg>
      </div>
    </div>
  );
};
