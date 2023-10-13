import pauseButton from "../assets/pause-button.png";
import { ControlsWrapper, Image, Text } from "./misc";

interface Props {
  timeInSeconds: number;
  onPause: () => void;
}

export function RunningState({ timeInSeconds, onPause }: Props) {
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
        <Image src={pauseButton} onClick={onPause} />
      </div>
    </ControlsWrapper>
  );
}
