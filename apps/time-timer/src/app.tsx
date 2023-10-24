import { useMachine } from "@xstate/react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Clock } from "./components/clock";
import { PausedState } from "./components/states/paused-state";
import { RunningState } from "./components/states/running";
import { StoppedState } from "./components/states/stopped";
import { timeTimerMachine } from "./time-timer";
import { getDurationAngle } from "./time-timer/svg-utils";
import { useReload } from "./time-timer/use-reload";

function TimeTimer() {
  const [state, send] = useMachine(timeTimerMachine, { devTools: true });

  const remainingTime = Math.abs(
    +Number(
      (state.context.durationInMinutes * 60 - state.context.elapsedInSeconds) /
        60,
    ).toFixed(2),
  );

  const dimsW = window.innerWidth - 40;
  const dimsH = window.innerHeight - 40;

  const clockDims = Math.min(dimsW, dimsH, 300);
  const reload = useReload();

  useEffect(() => {
    window.addEventListener("resize", reload);

    return () => {
      window.removeEventListener("resize", reload);
    };
  }, [reload]);

  return (
    <div className="w-full min-h-screen flex items-center">
      <div className="mx-auto max-w-2xl">
        <Glow />
        <div className="relative flex flex-col items-stretch justify-center gap-10 md:flex-row">
          <Clock
            width={clockDims}
            height={clockDims}
            rotation={getDurationAngle(remainingTime)}
            applyTransition={!state.matches("running")}
          />
          {state.matches("stopped") && (
            <StoppedState
              durationInMinutes={state.context.durationInMinutes}
              onStart={() => {
                send("PLAY");
              }}
              onUpdateTime={(durationInMinutes) => {
                send({
                  type: "UPDATE_DURATION",
                  durationInMinutes,
                });
              }}
            />
          )}
          {state.matches("running") && (
            <RunningState
              onPause={() => {
                send("PAUSE");
              }}
              timeInSeconds={
                state.context.durationInMinutes * 60 -
                state.context.elapsedInSeconds
              }
            />
          )}
          {state.matches("paused") && (
            <PausedState
              onStop={() => {
                send("STOP");
              }}
              onResume={() => {
                send("RESUME");
              }}
              timeInSeconds={
                state.context.durationInMinutes * 60 -
                state.context.elapsedInSeconds
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

const Glow = () => {
  const [, setX] = useState(0);
  const [, setY] = useState(0);
  const size = 200;

  useEffect(() => {
    const listener = (ev: MouseEvent) => {
      setX(ev.clientX - size / 2);
      setY(ev.clientY - size / 2);
    };
    window.addEventListener("mousemove", listener);

    return () => {
      window.removeEventListener("mousemove", listener);
    };
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden">
      <motion.div
        className="absolute pointer-events-none"
        style={{
          bottom: 200,
          right: 400,
          width: size,
          height: size,
          background: "rgba(255, 103, 103, 0.7)",
          filter: "blur(222px)",
        }}
        animate={
          {
            // x,
            // y,
          }
        }
      />
    </div>
  );
};

export default TimeTimer;
