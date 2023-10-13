import clockBaseImg from "../assets/clock-base.png";
import clockBaseImgDark from "../assets/dark-clock-base.png";

export const ClockBase = ({
  clockWidth = 0,
  clockHeight = 0,
  mode,
}: {
  clockWidth?: number;
  clockHeight?: number;
  mode: "dark" | "light";
}) => (
  <img
    src={mode === "dark" ? clockBaseImgDark : clockBaseImg}
    style={{
      pointerEvents: "none",
      position: "absolute",
      inset: 0,
      width: clockWidth,
      height: clockHeight,
    }}
  />
);
