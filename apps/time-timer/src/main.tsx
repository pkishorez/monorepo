import React from "react";
import ReactDOM from "react-dom/client";
import TimeTimer from "./app.tsx";
import { inspect } from "@xstate/inspect";
import "./style.css";

inspect({
  // options
  // url: 'https://stately.ai/viz?inspect', // (default)
  iframe: false, // open in new window
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TimeTimer />
  </React.StrictMode>,
);
