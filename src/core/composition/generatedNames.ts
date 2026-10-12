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

    // Preserve readable private names when available; resolve ambiguous hints
    // using the structured identity, never by parsing their delimiters.
    const hash = createHash("sha256").update(identity).digest("hex");
    const safeHint = hint.replace(/[^a-zA-Z0-9_-]/g, "-") || "item";
    for (const candidate of [
      safeHint,
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
