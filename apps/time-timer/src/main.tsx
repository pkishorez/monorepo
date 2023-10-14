import { inspect } from "@xstate/inspect";
import React from "react";
import ReactDOM from "react-dom/client";
import TimeTimer from "./app.tsx";
import "./style.css";

if (process.env.NODE_ENV === "development") {
  inspect({
    // options
    // url: 'https://stately.ai/viz?inspect', // (default)
    iframe: false, // open in new window
  });
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TimeTimer />
  </React.StrictMode>,
);
