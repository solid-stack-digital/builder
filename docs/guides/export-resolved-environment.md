# Export effective main environment

Use `builder service export env dev`, `prod`, `test`, or `e2e`; omit the stage to export all. `--full` affects dev's integrated graph. The command exports main's resolved environment for the selected configuration stage into its stage-specific output, overwriting that output; it does not export tester env. An exported file is an inspection artifact, not input to Builder's internal execution variables. See [precedence](../reference/environment-precedence.md) and `builder service export env --help` for exact options.
