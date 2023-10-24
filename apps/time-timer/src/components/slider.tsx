import { motion, useDragControls, useMotionValue } from "framer-motion";
import { useRef } from "react";
import sliderImage from "./assets/slider-button.png";

interface Props {
  initialValue: number;
  onUpdate: (value: number) => void;
}
export const Slider = ({ onUpdate }: Props) => {
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

  const constraintRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const controls = useDragControls();

  const oldValue = useRef(0);
  const handleDrag = () => {
    const slider = sliderRef.current;
    const constraint = containerRef.current;

    if (!slider || !constraint) {
      return;
    }

    const sliderRect = slider.getBoundingClientRect();
    const constraintRect = constraint.getBoundingClientRect();

    const progress = Math.round(
      ((sliderRect.left - constraintRect.left) / constraintRect.width) *
        minutes,
    );

    if (oldValue.current === progress) {
      return;
    }
    oldValue.current = progress;

    onUpdate(progress);
  };

  return (
    <div className="flex flex-col gap-y-2 mt-6">
      <div
        className={"rounded-2xl bg-[#111] h-[10px] " + "relative"}
        style={{
          boxShadow: "0px 4px 2px 0px rgba(0, 0, 0, 0.60) inset",
        }}
      >
        <div
          className="absolute left-[7px] right-[6px] top-0"
          ref={constraintRef}
        >
          <div className="w-full" ref={containerRef} />
          <motion.div
            ref={sliderRef}
            drag="x"
            dragControls={controls}
            dragConstraints={constraintRef}
            style={{ x }}
            transition={{
              type: "spring",
              damping: 20,
              stiffness: 300,
            }}
            dragElastic={0}
            dragMomentum={false}
            onDrag={handleDrag}
            className="absolute top-1/2"
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
