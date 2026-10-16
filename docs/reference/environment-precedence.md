# Environment precedence

Later applicable values win. Builder resolves references only in the final surviving value. This does not let an invalid active external reference work in an isolated graph.

| Recipient | Low → high precedence |
|---|---|
| Standalone main | selected main dotenv → source base env → source stage env → selected main override env → Builder-owned variables |
| Standalone E2E main | `.env.e2e` → base → prod → e2e env → selected override → Builder-owned variables |
| Mesh main | source selected dotenv → source base/stage env → selected main override env → mesh base/stage `extends.main.env` → Builder-owned variables |
| Global E2E main | source `.env.e2e` → source base/prod/e2e → selected override → mesh base/prod/e2e extends → Builder-owned variables |
| Ordinary module | each container's native Compose defaults/env_file → source base/stage env → mesh base/stage extends env |
| Source tester | native runner defaults → source `.env.e2e-tester` → source base/prod/e2e tester env |
| Global tester | native runner defaults → mesh `.env.e2e-tester` → mesh base/prod/e2e tester env |

E2E inherits **structured** prod configuration but reads `.env.e2e` instead of `.env.prod`. Ordinary modules do not inherit main dotenv; Builder's ordinary env applies to every container in that atomic module. Tester env applies to the selected runner, not its helpers, and it receives neither main dotenv nor `EXEC_MODE`, `INFRA_MODE`, or `PORT` from Builder. Reserved main execution keys cannot be set by user layers when Builder owns them. Override Compose is one selected file, not a stack of dev/prod/e2e files.
