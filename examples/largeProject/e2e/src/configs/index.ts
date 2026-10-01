export interface AppEnvironment {
	readonly backendUrl: string;
	readonly frontendUrl: string;
	readonly gatewayUrl: string;
	readonly gatewayHost: string;
	readonly gatewayPort: number;
	readonly hostGatewayUrl: string;
	readonly isDocker: boolean;
}

export function loadEnvironment(): AppEnvironment {
	const isDocker = Boolean(
		process.env.CI ||
			process.env.BACKEND_URL?.includes("backend") ||
			process.env.GATEWAY_URL?.includes("gateway"),
	);

	const defaultGateway = isDocker
		? "http://gateway:80"
		: "http://localhost:3000";
	const defaultBackend = isDocker
		? "http://backend:3000"
		: "http://localhost:3000";
	const defaultFrontend = isDocker
		? "http://frontend:3000"
		: "http://localhost:3000";

	const gatewayUrl = (
		process.env.GATEWAY_URL ||
		process.env.APP_URL ||
		process.env.INTERNAL_PMIS_GATEWAY_URL ||
		defaultGateway
	).replace(/\/+$/, "");

	const backendUrl = (
		process.env.BACKEND_URL ||
		process.env.INTERNAL_PMIS_BACKEND_URL ||
		defaultBackend
	).replace(/\/+$/, "");

	const frontendUrl = (
		process.env.FRONTEND_URL ||
		process.env.INTERNAL_PMIS_WEB_NEXTJS_URL ||
		defaultFrontend
	).replace(/\/+$/, "");

	const hostGatewayPort = process.env.GATEWAY_PORT || "3000";
	const defaultHostGateway = isDocker
		? `http://host.docker.internal:${hostGatewayPort}`
		: `http://localhost:${hostGatewayPort}`;

	const hostGatewayUrl = (
		process.env.HOST_GATEWAY_URL || defaultHostGateway
	).replace(/\/+$/, "");

	let gatewayHost = isDocker ? "gateway" : "localhost";
	let gatewayPort = isDocker ? 80 : 3000;
	try {
		const parsed = new URL(gatewayUrl);
		gatewayHost = parsed.hostname;
		if (parsed.port) {
			gatewayPort = parseInt(parsed.port, 10);
		} else {
			gatewayPort = parsed.protocol === "https:" ? 443 : 80;
		}
	} catch {
		// fallback to defaults
	}

	return {
		backendUrl,
		frontendUrl,
		gatewayUrl,
		gatewayHost,
		gatewayPort,
		hostGatewayUrl,
		isDocker,
	};
}
