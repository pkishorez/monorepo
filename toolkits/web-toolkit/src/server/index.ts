// A web app's server: its pages and its `/rpc` API from one fetch handler,
// and the stages alchemy deploys it to.
export { serveRpc, type RpcServices } from './rpc/index.ts';
export {
  assertStageIsSafe,
  devConfigFor,
  domainFor,
  isDeployedStage,
} from './stage/index.ts';
export { type Handle, webServer } from './worker/index.ts';
