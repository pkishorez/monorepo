import clockBaseImg from "../assets/clock-base.png";

export const ClockBase = ({ clockWidth = 0, clockHeight = 0 }) => (
  <img
    src={clockBaseImg}
    style={{
      pointerEvents: "none",
      position: "absolute",
      inset: 0,
      width: clockWidth,
      height: clockHeight,
    }}
  />
);
