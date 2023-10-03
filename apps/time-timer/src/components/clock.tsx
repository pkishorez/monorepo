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
  return (
    <div
      style={{
        position: "relative",
        margin: "auto",
        width,
        height,
      }}
    >
      <ClockBase clockHeight={height} clockWidth={width} />
      <Disc
        clockWidth={width}
        clockHeight={height}
        rotation={rotation}
        applyTransition={applyTransition}
      />
      <Knob
        clockWidth={width}
        clockHeight={height}
        applyTransition={applyTransition}
        rotation={rotation}
      />
    </div>
  );
};
