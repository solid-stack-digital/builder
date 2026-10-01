import * as net from "node:net";

export interface PortCheckOptions {
	host: string;
	port: number;
	timeoutMs?: number;
}

export interface PortCheckResult {
	port: number;
	open: boolean;
	error?: string;
}

/**
 * Checks whether a TCP port on a given host is open and accepting connections.
 */
export function checkPortStatus({
	host,
	port,
	timeoutMs = 1500,
}: PortCheckOptions): Promise<{ open: boolean; error?: string }> {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		let isResolved = false;

		const cleanup = (open: boolean, error?: string) => {
			if (!isResolved) {
				isResolved = true;
				socket.removeAllListeners();
				socket.destroy();
				resolve({ open, error });
			}
		};

		socket.setTimeout(timeoutMs);

		socket.once("connect", () => {
			cleanup(true);
		});

		socket.once("timeout", () => {
			cleanup(false, "Timeout");
		});

		socket.once("error", (err: Error) => {
			cleanup(false, err.message || "Connection refused");
		});

		try {
			socket.connect(port, host);
		} catch (err: unknown) {
			cleanup(false, err instanceof Error ? err.message : String(err));
		}
	});
}

/**
 * Scans an array of ports on a specified host and returns their status.
 */
export async function scanPorts(
	host: string,
	ports: number[],
	timeoutMs = 1500,
): Promise<PortCheckResult[]> {
	const results = await Promise.all(
		ports.map(async (port) => {
			const res = await checkPortStatus({ host, port, timeoutMs });
			return { port, open: res.open, error: res.error };
		}),
	);
	return results;
}

/**
 * Polls a port until it becomes open or timeout expires.
 */
export async function waitForPort(
	host: string,
	port: number,
	timeoutMs = 30000,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const res = await checkPortStatus({ host, port, timeoutMs: 1000 });
		if (res.open) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(
		`[Port Timeout]: Port ${port} on ${host} did not open within ${timeoutMs}ms.`,
	);
}
