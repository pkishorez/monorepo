// routes/api.ts
import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { packageInfo } from "~/logic/implementation";
import { RequestSchema } from "./schema";

export let action: ActionFunction = async ({ request }) => {
  // Parse the incoming JSON data from the request
  const requestData = await request.json();

  // Validate the request data using Zod
  const validatedData = RequestSchema.parse(requestData);

  switch (validatedData.type) {
    case "PACKAGE_INFO":
      return json(await packageInfo.request(validatedData.payload.pkgName));
  }
};
