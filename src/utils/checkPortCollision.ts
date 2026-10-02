import net from "node:net";
import pc from "picocolors";
import { parse } from "yaml";

export function extractHostPorts(yamlConfig: string): number[] {
  const ports: number[] = [];
  try {
    const parsed = parse(yamlConfig);
    if (parsed?.services && typeof parsed.services === "object") {
      for (const svc of Object.values(parsed.services) as any[]) {
        if (Array.isArray(svc?.ports)) {
          for (const p of svc.ports) {
            if (typeof p === "string") {
              const parts = p.split(":");
              const hostPort =
                parts.length > 1 ? parseInt(parts[0]!, 10) : parseInt(p, 10);
              if (!isNaN(hostPort)) ports.push(hostPort);
            } else if (typeof p === "object" && p.published) {
              const hostPort = parseInt(p.published, 10);
              if (!isNaN(hostPort)) ports.push(hostPort);
            }
          }
        }
      }
    }
  } catch {
    // ignore parsing errors during port extraction
  }
  return ports;
}

export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: any) => {
      if (err.code === "EADDRINUSE" || err.code === "EACCES") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "0.0.0.0");
  });
}

export async function checkHostPortCollisions(ports: number[]): Promise<void> {
  for (const port of ports) {
    if (port > 0 && port < 65536) {
      const inUse = await isPortInUse(port);
      if (inUse) {
        console.warn(
          pc.yellow(
            `\n⚠️ Host Port Conflict Warning: Port ${port} is already in use on the host (e.g. by another running stage or process). Docker Compose may fail to bind to this port.\n`
          )
        );
      }
    }
  }
}

