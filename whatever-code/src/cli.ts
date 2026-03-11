import { startServer } from "./server.js";

startServer({
  port: 4400,
  proxyTarget: "http://localhost:20004",
});
