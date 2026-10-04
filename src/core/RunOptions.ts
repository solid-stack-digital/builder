
export type RunOptions = {
  projectDir: string;
  debug: boolean;
  detach: boolean;
  dryRun?: boolean | undefined;
  skipBanner?: boolean | undefined;
  silenceWarnings?: boolean | undefined;
  full?: boolean | undefined;
};

