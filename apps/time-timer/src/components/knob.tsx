import { motion, useTransform } from "framer-motion";
import knobImg from "../assets/knob.png";
import { useAnimate } from "../time-timer/use-animate";

export const Knob = ({
  clockWidth,
  clockHeight,
  rotation = 0,
  applyTransition = true,
}: {
  clockWidth: number;
  clockHeight: number;
  applyTransition: boolean;
  rotation?: number;
}) => {
  const motionValue = useAnimate(rotation, applyTransition);

  const rotate = useTransform(() => {
    return `${(motionValue.get() - 90 * 3) * -1}deg`;
  });

  const knobDims = {
    width: (225 / 750) * clockWidth,
    height: (225 / 750) * clockHeight,
    left: 0,
    top: 0,
  };
  knobDims.left = (clockWidth - knobDims.width) / 2;
  knobDims.top = (clockHeight - knobDims.height) / 2;

  return (
    <motion.img
      src={knobImg}
      style={{
        pointerEvents: "none",
        position: "absolute",
        inset: 0,
        ...knobDims,
        rotate,
      }}
    />
  );
};
