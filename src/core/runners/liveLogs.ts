import { currentOutput } from "../output/index.js";
import { followCompose, type FollowHandle, type runCompose } from "../runCompose.js";

export type FollowCompose = typeof followCompose;

/** How long to let a follower drain after the followed service has exited. */
export const FOLLOW_DRAIN_MS = 10_000;

/**
 * Pick the log follower: an explicit adapter, else one that runs through an injected
 * `compose` adapter (keeps workflow tests process-free), else a real `docker compose logs -f`.
 */
export function followerFor(adapters: { follow?: FollowCompose; compose?: typeof runCompose }): FollowCompose {
  if (adapters.follow) return adapters.follow;
  const compose = adapters.compose;
  if (!compose) return followCompose;
  return (args, yaml, projectDir) => {
    const done = compose(args, yaml, projectDir, { removeVolumes: true }).catch((error: unknown) => {
      currentOutput().warn("Could not follow logs", error);
      return 1;
    });
    return { done, stop: () => done };
  };
}

/** Wait briefly for the follower to finish on its own, then stop it. */
export async function finishFollow(handle: FollowHandle, drainMs = FOLLOW_DRAIN_MS): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([handle.done, new Promise<void>((resolve) => { timer = setTimeout(resolve, drainMs); })]);
  if (timer) clearTimeout(timer);
  await handle.stop();
}
