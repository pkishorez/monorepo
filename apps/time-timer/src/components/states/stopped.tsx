import playButton from "../assets/play-button.png";
import { Slider } from "../slider";
import { ControlsWrapper, Image, Text } from "./misc";

interface Props {
  onStart: () => void;
  onUpdateTime: (durationInMinutes: number) => void;
  durationInMinutes: number;
}

export const StoppedState = ({
  onStart,
  onUpdateTime,
  durationInMinutes,
}: Props) => {
  return (
    <ControlsWrapper>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          justifyContent: "center",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 32,
            columnGap: 40,
          }}
        >
          <Text>Set Timer</Text>
          <Text>{String(durationInMinutes).padStart(2, "0")}:00</Text>
        </div>

        <Slider initialValue={durationInMinutes} onUpdate={onUpdateTime} />

        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingRight: 32,
            marginLeft: -8,
          }}
          onClick={onStart}
        >
          <Image src={playButton} />
          <Text>START</Text>
        </button>
      </div>
    </ControlsWrapper>
  );
};
