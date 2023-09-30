import { ClockBase } from "./base";
import { Knob } from "./knob";

export const Clock = ({ width, height }: { width: number; height: number }) => {
  const viewBoxDims = {
    width: 2900,
    height: 2900,
  };
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 2900 2900"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ClockBase />
      <Knob x={viewBoxDims.width / 2} y={viewBoxDims.height / 2} />
    </svg>
  );
};
