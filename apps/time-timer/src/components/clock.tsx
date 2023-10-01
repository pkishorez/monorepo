import { ClockBase } from "./base";
import { Disc } from "./disc";
import { Knob } from "./knob";

export const Clock = ({
  width,
  height,
  rotation = 0,
  applyTransition = false,
}: {
  width: number;
  height: number;
  rotation?: number;
  applyTransition?: boolean;
}) => {
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
      <Disc
        x={viewBoxDims.width / 2}
        y={viewBoxDims.height / 2}
        rotation={rotation}
        applyTransition={applyTransition}
      />
      <Knob
        x={viewBoxDims.width / 2}
        y={viewBoxDims.height / 2}
        rotation={rotation}
        applyTransition={applyTransition}
      />
    </svg>
  );
};
