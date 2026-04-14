import { startServer } from "./server/index.js";

startServer({
  port: 4400,
  proxyTarget: "http://localhost:20004",
});
