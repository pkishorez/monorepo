import { useMachine } from "@xstate/react";
import { Clock } from "./components";
import { timeTimerMachine } from "./time-timer";
import { getDurationAngle } from "./time-timer/svg-utils";

function TimeTimer() {
  const [state, send] = useMachine(timeTimerMachine, { devTools: true });

  const remainingTime = Math.abs(
    +Number(
      (state.context.durationInMinutes * 60 - state.context.elapsedInSeconds) /
        60,
    ).toFixed(2),
  );
  return (
    <div className="wrapper">
      <Clock
        width={400}
        height={400}
        rotation={getDurationAngle(remainingTime)}
        applyTransition={!state.matches("running")}
      />
      <div>
        <input
          type="range"
          min={0}
          max={60}
          value={state.context.durationInMinutes}
          onChange={(e) => {
            send({
              type: "UPDATE_DURATION",
              durationInMinutes: Number(e.target.value),
            });
          }}
        />
      </div>

      <div>
        <div>Elapsed: {state.context.elapsedInSeconds} S</div>
        <div>Duration: {state.context.durationInMinutes} M</div>
        <div>Remaining: {remainingTime} M</div>
      </div>

      <div>
        {state.can({ type: "PLAY", durationInMinutes: 10 }) && (
          <button onClick={() => send("PLAY")}>Play</button>
        )}
        {state.can("PAUSE") && (
          <button onClick={() => send("PAUSE")}>Pause</button>
        )}
        {state.can("RESUME") && (
          <button onClick={() => send("RESUME")}>Resume</button>
        )}
        {state.can("STOP") && (
          <button onClick={() => send("STOP")}>Stop</button>
        )}
      </div>
    </div>
  );
}

export default TimeTimer;
