import { runCompose } from "../runCompose.js";

/** Start the full topology, then return only the finite tester's exit status. */
export async function runFiniteTester(
  yaml: string,
  projectDir: string,
  testerServiceName: string,
): Promise<number> {
  const startStatus = await runCompose(
    ["up", "--build", "--detach"],
    yaml,
    projectDir,
    { removeVolumes: true },
  );
  if (startStatus !== 0) return startStatus;
  const testerStatus = await runCompose(
    ["wait", testerServiceName],
    yaml,
    projectDir,
    { removeVolumes: true },
  );
  // Detached startup does not stream container output. Show the completed
  // topology's logs before cleanup, without replacing the tester's status.
  await runCompose(["logs", "--no-color"], yaml, projectDir, {
    removeVolumes: true,
  });
  return testerStatus;
}
