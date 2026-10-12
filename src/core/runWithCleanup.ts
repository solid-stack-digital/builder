import { ScriptError } from "../errors/ScriptError.js";
import { errorMessage } from "../utils/errorMessage.js";

/** Preserve execution diagnostics if cleanup also fails. */
export async function runWithCleanup(
  run: () => Promise<number>,
  cleanup: () => Promise<void>,
): Promise<number> {
  let executionFailed = false;
  let executionError: unknown;
  try {
    const status = await run();
    if (status !== 0) {
      executionFailed = true;
      executionError = new ScriptError(`Compose execution exited with code ${status}`, { exitCode: status });
    }
    return status;
  } catch (error) {
    executionFailed = true;
    executionError = error;
    throw error;
  } finally {
    try {
      await cleanup();
    } catch (cleanupError) {
      if (executionFailed) {
        throw new AggregateError(
          [executionError, cleanupError],
          `Compose execution failed (${errorMessage(executionError)}); cleanup also failed (${errorMessage(cleanupError)}). Saved run state was retained`,
        );
      }
      throw cleanupError;
    }
  }
}
