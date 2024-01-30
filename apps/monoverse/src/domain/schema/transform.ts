import type { z } from "zod";
import { removeUndefined } from "../../tools";
import { dependencySchema, workspaceSchema } from "./core";
import { packageJsonSchema } from "./package-json";

export const packageJsonToWorkspace = (
  packageJson: z.infer<typeof packageJsonSchema>,
): z.infer<typeof workspaceSchema> => {
  const {
    dependencies,
    devDependencies,
    peerDependencies,
    optionalDependencies,
  } = packageJson;

  const getDependencies = (
    list: z.infer<typeof packageJsonSchema>["dependencies"],
    type: z.infer<typeof dependencySchema>["type"],
  ): z.infer<typeof dependencySchema>[] => {
    if (!list) return [];

    return Object.entries(list).map(([name, versionRange]) => {
      return {
        name,
        versionRange,
        type,
      };
    });
  };

  return workspaceSchema.parse(
    // removeUndefined to ensure that the workspace doesn't have any undefined
    removeUndefined({
      name: packageJson.name,
      description: packageJson.description,
      dependencies: [
        ...getDependencies(dependencies, "dependency"),
        ...getDependencies(devDependencies, "devDependency"),
        ...getDependencies(peerDependencies, "peerDependency"),
        ...getDependencies(optionalDependencies, "optionalDependency"),
      ],
    }),
  );
};
