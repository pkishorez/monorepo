import {
  EMPTY,
  catchError,
  from,
  mergeMap,
  retry,
  scan,
  throttleTime,
} from "rxjs";
import type { z } from "zod";
import { packageInfo } from "~/logic/implementation";
import type { RequestSchema } from "./schema";

const apiRequest = (req: z.infer<typeof RequestSchema>) => {
  return fetch("/api", {
    method: "POST",
    body: JSON.stringify(req),
    headers: {
      "Content-Type": "application/json",
    },
  });
};

const fetchPackageInfo = (req: z.infer<typeof packageInfo.requestSchema>) => {
  return apiRequest({
    type: "PACKAGE_INFO",
    payload: {
      pkgName: req,
    },
  })
    .then((v) => v.json())
    .then((v) => packageInfo.responeSchema.parse(v));
};

export const fetchPackagesMap = (packages: string[]) =>
  from(packages).pipe(
    mergeMap(
      (pkgName) =>
        from(fetchPackageInfo(pkgName)) // BR
          .pipe(catchError(() => EMPTY)),
      5,
    ),
    retry(3),
    scan(
      (acc, curr) => ({ ...acc, [curr.name]: curr }),
      {} as Record<string, z.infer<typeof packageInfo.responeSchema>>,
    ),
    throttleTime(2000, undefined, { leading: false, trailing: true }),
  );
