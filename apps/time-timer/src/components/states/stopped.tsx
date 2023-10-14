import { cn } from "@monorepo/design-system";
import { motion } from "framer-motion";
import playButton from "../assets/play-button.png";
import { Slider } from "../slider";
import { ControlsWrapper, Text } from "./misc";

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
      <div className="flex flex-col gap-y-4 justify-center items-stretch">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 32,
            columnGap: 40,
          }}
          className="flex justify-between text-[32px]"
        >
          <Text>Set Timer</Text>
          <Text>{String(durationInMinutes).padStart(2, "0")}:00</Text>
        </div>

        <Slider initialValue={durationInMinutes} onUpdate={onUpdateTime} />

        <motion.button
          whileHover={{ scale: durationInMinutes === 0 ? 1 : 1.1 }}
          whileTap={{ scale: durationInMinutes === 0 ? 1 : 0.9 }}
          animate={{ opacity: durationInMinutes === 0 ? 0.5 : 1 }}
          className={cn(
            "inline-flex self-start items-center gap-2 pr-8 -ml-2",
            {
              "cursor-not-allowed": durationInMinutes === 0,
            },
          )}
          onClick={onStart}
        >
          <img
            style={{
              margin: -12,
              width: 70,
            }}
            src={playButton}
          />
          <Text>START</Text>
        </motion.button>
      </div>
    </ControlsWrapper>
  );
};
