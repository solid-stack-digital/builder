import { lstatSync, readlinkSync, realpathSync } from "node:fs";
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

  // If path is absolute (e.g. cross-drive on Windows like D:/...), do not prepend ./
  if (path.isAbsolute(rel) || /^[a-zA-Z]:\//.test(rel)) {
    return rel;
  }

  if (rel.startsWith("./") || rel.startsWith("../") || rel.startsWith("/")) {
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
  if (source.startsWith(".") || source.startsWith("/") || source.startsWith("~") || source.startsWith("\\")) {
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
  const absParent = canonicalPath(parentDir);
  const absChild = canonicalPath(path.resolve(parentDir, childPath));
  const rel = path.relative(absParent, absChild);
  return (
    rel !== ".." &&
    !rel.startsWith(".." + path.sep) &&
    !rel.startsWith("../") &&
    !path.isAbsolute(rel)
  );
}

/** Resolve symlinks even when the final artifact has not been created yet. */
export function canonicalPath(value: string): string {
 const absolute = path.resolve(value);
 try { return realpathSync(absolute); }
 catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  // A dangling symlink still owns a target path, even before that target exists.
  try {
   if (lstatSync(absolute).isSymbolicLink()) return canonicalPath(path.resolve(path.dirname(absolute), readlinkSync(absolute)));
  } catch (linkError) {
   if ((linkError as NodeJS.ErrnoException).code !== "ENOENT") throw linkError;
  }
  const parent = path.dirname(absolute);
  if (parent === absolute) throw error;
  return path.join(canonicalPath(parent), path.basename(absolute));
 }
}
