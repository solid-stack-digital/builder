import path from 'node:path';
import { isBindMount } from '../../utils/paths.js';

/** Short syntax, with drive colons kept inside Windows source/target paths. */
export function parseVolume(mount: unknown): { type: string; source?: string; target: string; suffix: string } | undefined {
 if (typeof mount === 'string') {
  const separators: number[] = [];
  let start = 0;
  for (let i = 0; i < mount.length; i++) {
   if (mount[i] !== ':') continue;
   if (i === start + 1 && /[a-z]/i.test(mount[start]!) && /[\\/]/.test(mount[i + 1] ?? '')) continue;
   separators.push(i); start = i + 1;
  }
  const first = separators[0];
  if (first === undefined) return { type: 'volume', target: mount, suffix: '' };
  const source = mount.slice(0, first), end = separators[1];
  return { type: isBindMount(source) ? 'bind' : 'volume', source, target: mount.slice(first + 1, end), suffix: mount.slice(first) };
 }
 if (mount && typeof mount === 'object') {
  const value = mount as Record<string, unknown>;
  return { type: String(value.type ?? 'volume'), ...(typeof value.source === 'string' ? { source: value.source } : {}), target: String(value.target ?? ''), suffix: '' };
 }
 return undefined;
}

export function rewriteVolumeSource(mount: unknown, source: string): unknown {
 const parsed = parseVolume(mount);
 return typeof mount === 'string' ? `${source}${parsed!.suffix}` : { ...(mount as object), source };
}
export function namespaceVolume(mount: unknown, names: Map<string, string>): unknown {
 const parsed = parseVolume(mount);
 const source = parsed?.type === 'volume' && parsed.source ? names.get(parsed.source) : undefined;
 return source ? rewriteVolumeSource(mount, source) : mount;
}
export function isAnonymousVolume(mount: unknown): boolean {
 const parsed = parseVolume(mount);
 return parsed?.type === 'volume' && !parsed.source;
}
export function isHostFilesystemRoot(source: string): boolean {
 const normalized = source.replaceAll('\\', '/');
 if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('//')) {
  const windows = path.win32.normalize(source);
  return windows === path.win32.parse(windows).root;
 }
 return path.posix.normalize(normalized) === '/';
}

export function anonymousVolumeServices(services: Record<string, {volumes?: unknown}>): string[] {
 return Object.entries(services).filter(([, service]) => Array.isArray(service.volumes) && service.volumes.some(isAnonymousVolume)).map(([name]) => name);
}
