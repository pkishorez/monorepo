import { ControlsWrapper, Image, Text } from "./misc";

import playButton from "../assets/play-button.png";
import stopButton from "../assets/stop-button.png";
interface Props {
  onResume: () => void;
  onStop: () => void;
  timeInSeconds: number;
}

export const PausedState = ({ onResume, onStop, timeInSeconds }: Props) => {
  const time = [
    `${String(Math.floor(timeInSeconds / 60)).padStart(2, "0")}`,
    ":",
    `${String(timeInSeconds % 60).padStart(2, "0")}`,
  ].join("");
  return (
    <ControlsWrapper>
      <div
        className={
          "flex justify-between items-center m-auto w-[250px] " +
          "px-5 py-4 rounded-lg bg-[#181818]"
        }
        style={{
          boxShadow: "0px 0px 17px 0px rgba(0, 0, 0, 0.4) inset",
        }}
      >
        <Text>{time}</Text>
        <div className="flex">
          <Image src={stopButton} onClick={onStop} />
          <Image src={playButton} onClick={onResume} />
        </div>
      </div>
    </ControlsWrapper>
  );
};
