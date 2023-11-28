import { getMonorepo } from "~/logic/implementation";

console.log(JSON.stringify(getMonorepo("./"), null, "  "));
