import { motion, useTransform } from "framer-motion";
import { useAnimate } from "./use-animate";
export const Disc = ({
  x,
  y,
  rotation = 0,
  applyTransition,
}: {
  x: number;
  y: number;
  rotation?: number;
  applyTransition: boolean;
}) => {
  const rotationMotionValue = useAnimate(rotation, applyTransition);
  const path = useTransform(() => {
    return generatePiePath(rotationMotionValue.get(), 1637 / 2);
  });

  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px) `,
      }}
    >
      <motion.path d={path} fill="rgba(248, 56, 76, 0.9)" />
    </g>
  );
};

function generatePiePath(angle: number, radius: number) {
  // Ensure angle is between 0 and 360
  // angle = angle % 360;
  if (angle > 0 && angle % 360 == 0) {
    angle = 360 - 1;
  }

  const startX = 0;
  const startY = -radius;

  const radianAngle = (Math.PI * angle) / 180;

  // Since we are going counter-clockwise, adjust the calculations
  const endX = Math.sin(radianAngle) * -radius;
  const endY = -Math.cos(radianAngle) * radius;

  // A flag for whether the arc should be greater than 180 degrees.
  const largeArcFlag = angle > 180 ? 1 : 0;

  const pathData = [
    `M ${startX} ${startY}`, // Move to the starting point
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${endX} ${endY}`, // Arc to the ending point (Note the 0 for sweep flag)
    `L 0 0`, // Line back to the center
  ].join(" ");

  return pathData;
}
