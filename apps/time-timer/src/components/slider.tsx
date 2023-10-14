import {
  motion,
  transform,
  useDragControls,
  useMotionValue,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
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

  const [constraintRef, setContraintRef] = useState<HTMLDivElement | null>(
    null,
  );
  const x = useMotionValue(0);
  const controls = useDragControls();

  const [left, right, loaded] = (() => {
    const { width } = constraintRef?.getBoundingClientRect?.() ?? {};
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
    <div className="flex flex-col gap-y-2 mt-6">
      <div
        className={"rounded-2xl bg-[#111] h-[10px] " + "relative"}
        style={{
          boxShadow: "0px 4px 2px 0px rgba(0, 0, 0, 0.60) inset",
        }}
        onPointerDown={(e) => {
          console.log("EVENT", e);
          controls.start(e);
        }}
      >
        <div
          className="absolute left-[7px] right-[6px] top-0"
          ref={(r) => {
            console.log("REF: ", r);
            /* @ts-ignore */
            setContraintRef(r);
          }}
        >
          {loaded && (
            <motion.div
              drag="x"
              dragControls={controls}
              style={{ x }}
              transition={{
                type: "spring",
                damping: 20,
                stiffness: 300,
              }}
              className="absolute top-1/2"
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
