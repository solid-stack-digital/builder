import path from "node:path";
import pc from "picocolors";
import { resolveProjectDir } from "../../../utils/paths.js";
import { runTestUnit } from "../../runners/runTestUnit.js";
import { checkMesh } from "../checkers/checkMesh.js";
import { getMeshJson } from "../getMeshJson.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";

export async function runMeshTestUnit(options: MeshRunOptions = {}): Promise<number> {
  const meshDir = resolveProjectDir(options.projectDir);

  console.log(pc.bold(pc.blue(`\n========================================`)));
  console.log(pc.bold(pc.blue(`🧪 [MESH] STAGE: ISOLATED UNIT TESTS`)));
  console.log(pc.bold(pc.blue(`========================================\n`)));

  if (!options.skipChecks) {
    checkMesh(meshDir, { requireTester: false });
  }
  const mesh = getMeshJson(meshDir);

  for (const [serviceName, serviceConfig] of Object.entries(mesh.services)) {
    const serviceDir = path.resolve(meshDir, serviceConfig.path);
    console.log(
      pc.cyan(`\n-> Running isolated unit tests for service: [${serviceName}]...`)
    );

    if (options.dryRun) {
      console.log(pc.green(`[DRY-RUN] Unit tests for ${serviceName} simulated.`));
      continue;
    }

    const unitStatus = await runTestUnit({
      projectDir: serviceDir,
      debug: Boolean(options.debug),
      detach: Boolean(options.detach),
      skipBanner: true,
    });

    if (unitStatus !== 0) {
      console.error(
        pc.red(`\n❌ Unit tests failed for service [${serviceName}] with exit code ${unitStatus}.\n`)
      );
      return unitStatus;
    }

    console.log(
      pc.bold(pc.green(`\n✅ Isolated unit tests passed for service: [${serviceName}]\n`))
    );
  }

  console.log(
    pc.bold(pc.green(`🎉 All mesh service unit tests completed successfully!\n`))
  );
  return 0;
}
