import { ConfigError } from "../../../errors/ConfigError.js";
import { allocateHostPorts, type PortIntent } from "../../config/hostPorts.js";
import { PUBLIC_HOST } from "../../config/constants.js";
import { buildDependencyBindings, bindingsMap } from "./substitution.js";
import { resolveMeshPublication } from "./publication.js";
import type { LoadedMeshService, EffectivePublication } from "./types.js";

export interface TestAppPublication {
  meshService: string;
  endpoint: string;
  logicalPath: string;
  containerPort: number;
  requested: number | "AUTO";
}

export interface ValidatedMeshTestStage {
  bindings: Map<string, string>;
  appPublications: TestAppPublication[];
  allocatedPorts: Map<string, number>;
}

export function validateMeshTestStage(
  services: Record<string, LoadedMeshService>,
  meshDir: string,
  meshPath: string,
  validationMode = false,
): ValidatedMeshTestStage {
  const bindings = bindingsMap(buildDependencyBindings(services, "test", meshPath));
  const publication: EffectivePublication[] = resolveMeshPublication(
    services,
    bindings,
    "test",
    meshPath,
  );

  for (const pub of publication) {
    if (pub.target === "dependency") {
      throw new ConfigError({
        sourceFile: meshPath,
        configPath: `services.${pub.ownerMeshService}.publish`,
        stage: "test",
        composition: "mesh",
        value: pub.logicalPath,
        reason: "mesh.test is isolated; dependency endpoints are not materialized and cannot be published",
      });
    }
  }

  const appPublications = publication
    .filter(pub => pub.target === "app")
    .sort((a, b) =>
      a.ownerMeshService.localeCompare(b.ownerMeshService) ||
      a.endpoint.localeCompare(b.endpoint),
    )
    .map(pub => {
      const endpoint =
        services[pub.ownerMeshService]!.effectiveBuild.app.endpoints[pub.endpoint]!;
      return {
        meshService: pub.ownerMeshService,
        endpoint: pub.endpoint,
        logicalPath: pub.logicalPath,
        containerPort: endpoint.port,
        requested: endpoint.publicPort!,
      };
    });

  const intents: PortIntent[] = appPublications.map(pub => ({
    logicalPath: pub.logicalPath,
    requested: pub.requested,
  }));
  const allocatedPorts = allocateHostPorts(
    meshDir,
    "test",
    intents,
    validationMode,
  );

  return { bindings, appPublications, allocatedPorts };
}

export function applyTestAppPublications(
  validated: ValidatedMeshTestStage,
  meshService: string,
  app: { ports?: unknown[] },
  endpointRegistry: Record<string, { publicHost?: string; publicPort?: number; effectivelyPublished: boolean }>,
): void {
  for (const publication of validated.appPublications) {
    if (publication.meshService !== meshService) continue;
    const published = validated.allocatedPorts.get(publication.logicalPath)!;
    const ports = Array.isArray(app.ports) ? app.ports : [];
    ports.push({
      target: publication.containerPort,
      published,
      host_ip: PUBLIC_HOST,
      protocol: "tcp",
    });
    app.ports = ports;

    const endpoint = endpointRegistry[publication.endpoint];
    if (endpoint) {
      endpoint.publicHost = PUBLIC_HOST;
      endpoint.publicPort = published;
      endpoint.effectivelyPublished = true;
    }
  }
}
