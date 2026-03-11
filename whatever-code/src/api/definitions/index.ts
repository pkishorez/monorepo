import { HelloRpcs } from "./hello.js";

export { HelloRpcs };

export class ApiRpcs extends HelloRpcs.merge() {}
