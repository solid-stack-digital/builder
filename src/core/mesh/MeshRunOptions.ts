export interface MeshRunOptions {
  projectDir?: string | undefined;
  debug?: boolean | undefined;
  detach?: boolean | undefined;
  dryRun?: boolean | undefined;
  skipChecks?: boolean | undefined;
}

export interface MeshDownOptions {
  projectDir?: string | undefined;
  volumes?: boolean | undefined;
  debug?: boolean | undefined;
}
