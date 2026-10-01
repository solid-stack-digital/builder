/**
 * Polls a service URL until it responds with an HTTP status or timeout expires.
 */
export async function waitForService(
	url: string,
	name: string,
	timeoutMs = 60000,
): Promise<void> {
	const startTime = Date.now();
	let lastError: unknown = null;
	let lastStatus: number | null = null;

	while (Date.now() - startTime < timeoutMs) {
		try {
			const res = await fetch(url, {
				method: "GET",
				signal: AbortSignal.timeout(3000),
			}).catch((err) => {
				lastError = err;
				return null;
			});

			// 502/503/504 means the gateway is up, but the proxied upstream service is not ready yet
			if (res !== null) {
				lastStatus = res.status;
				if (res.status !== 502 && res.status !== 503 && res.status !== 504) {
					return;
				}
			}
		} catch (err) {
			lastError = err;
		}
		await new Promise((r) => setTimeout(r, 800));
	}

	throw new Error(
		`[Connection Timeout]: Could not connect to ${name} at ${url} within ${timeoutMs}ms.\n` +
			`Last status: ${lastStatus}\n` +
			`Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}\n` +
			`Ensure the containers are running and healthy.`,
	);
}

/**
 * Checks if a service is available within the given timeout without throwing.
 */
export async function isServiceAvailable(
	url: string,
	timeoutMs = 2000,
): Promise<boolean> {
	try {
		const res = await fetch(url, {
			method: "GET",
			signal: AbortSignal.timeout(timeoutMs),
		}).catch(() => null);
		return res !== null;
	} catch {
		return false;
	}
}
