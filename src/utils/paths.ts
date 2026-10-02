import path from "node:path";

/**
 * Resolves a project directory once at the boundary to an absolute path.
 */
export function resolveProjectDir(projectDir?: string): string {
  return path.resolve(projectDir ?? process.cwd());
}

/**
 * Converts a target path to a POSIX-compliant relative compose path from baseDir,
 * prefixed with './' if not already prefixed.
 */
export function toComposePath(baseDir: string, targetPath: string): string {
  const absBase = path.resolve(baseDir);
  const absTarget = path.resolve(absBase, targetPath);
  let rel = path.relative(absBase, absTarget);

  if (!rel || rel === ".") {
    return ".";
  }

  // Normalize Windows backslashes to POSIX slashes
  rel = rel.replace(/\\/g, "/");

  if (rel.startsWith(".") || rel.startsWith("/")) {
    return rel;
  }
  return `./${rel}`;
}

/**
 * Determines whether a volume source string refers to a host bind mount.
 * Host bind mounts begin with '.', '/', '~', or a Windows drive pattern (e.g. C:\ or C:/).
 * Everything else (e.g. 'db_data', 'cache_vol') is a named volume.
 */
export function isBindMount(source: string): boolean {
  if (!source) return false;
  if (source.startsWith(".") || source.startsWith("/") || source.startsWith("~")) {
    return true;
  }
  // Windows drive letter check: e.g. C:\path or C:/path
  if (/^[a-zA-Z]:[\\/]/.test(source)) {
    return true;
  }
  return false;
}

/**
 * Verifies that a path does not escape the project directory.
 */
export function isPathInside(parentDir: string, childPath: string): boolean {
  const absParent = path.resolve(parentDir);
  const absChild = path.resolve(absParent, childPath);
  const rel = path.relative(absParent, absChild);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}
