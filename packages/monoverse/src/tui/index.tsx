import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { colors } from "../theme.js";

export const renderTui = async () => {
  function App() {
    const { width, height } = useTerminalDimensions();

    useKeyboard((key) => {
      if (key.name === "q") {
        renderer.destroy();
        process.exit(0);
      }
    });

    return (
      <box
        width={width}
        height={height}
        justifyContent="center"
        alignItems="center"
      >
        <text>
          <span fg={colors.primary}>coming soon</span>
        </text>
        <text>
          <span fg={colors.muted}>press q to exit</span>
        </text>
      </box>
    );
  }
  const renderer = await createCliRenderer({
    exitSignals: ["SIGTERM", "SIGINT", "SIGHUP"],
  });

  return createRoot(renderer).render(<App />);
};
