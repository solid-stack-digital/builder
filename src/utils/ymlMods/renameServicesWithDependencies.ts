import type { BuildDependency } from "../../types/index.js";

export const renameServicesWithDependencies = (
  yml: any,
  dependencies: BuildDependency[]
) => {
  if (!yml || !yml.services) {
    throw new Error("Invalid YAML structure. Missing 'services' field.");
  }

  if (!dependencies || dependencies.length === 0) {
    return;
  }

  yml.services = Object.fromEntries(
    Object.entries(yml.services).map(([name, service]) => {
      const dependency = dependencies.find((d) => d.serviceName === name);
      return [dependency ? dependency.name : name, service];
    })
  );
};
