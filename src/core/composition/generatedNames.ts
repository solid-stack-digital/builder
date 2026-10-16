import { createHash } from "node:crypto";

/** One allocation scope per output composition. Hints never encode ownership. */
export class GeneratedComposeNameAllocator {
  private readonly occupied: Set<string>;
  private readonly allocated = new Map<string, string>();

  constructor(initialNames: Iterable<string> = []) {
    this.occupied = new Set(initialNames);
  }

  allocate(identity: string, hint: string): string {
    const existing = this.allocated.get(identity);
    if (existing) return existing;

    // Main roots have unique declared aliases. Other identities include a
    // stable digest so colliding hints map identically in any input order.
    const hash = createHash("sha256").update(identity).digest("hex");
    const safeHint = hint.replace(/[^a-zA-Z0-9_-]/g, "-") || "item";
    let rootMain = false;
    try {
      const parts: unknown = JSON.parse(identity);
      rootMain = Array.isArray(parts) && parts.length === 2 && parts[1] === "main" && typeof parts[0] === "string" && parts[0].startsWith("[");
    } catch {
      rootMain = false;
    }
    for (const candidate of [
      ...(rootMain ? [safeHint] : []),
      ...[12, 16, 24, 32, 64].map(length => `${safeHint}-${hash.slice(0, length)}`),
    ]) {
      if (this.occupied.has(candidate)) continue;
      this.occupied.add(candidate);
      this.allocated.set(identity, candidate);
      return candidate;
    }
    throw new Error(`Unable to allocate unique Compose name for ${identity}`);
  }

  assertUnique(): void {
    if (new Set(this.allocated.values()).size !== this.allocated.size) {
      throw new Error("Internal generated Compose name collision");
    }
  }
}
