# Main Dockerfile contract

The application project uses its canonical `Dockerfile` with `dev`, `test`, and `prod` targets. `dev` and `prod` must provide an enabled usable healthcheck, either in the target or inherited from the image; `HEALTHCHECK NONE` disables it. `test` runs isolated unit work and may finish. `dev` should run in the foreground so Compose can manage its lifetime. `EXPOSE` is allowed; Builder still owns host port mappings for declared endpoints.

Builder does not require a `test-e2e` target. Service E2E uses the `prod` main image and a separate tester Compose implementation, which may have its own Dockerfile and build target. The policy does not mandate a specific `COPY --from` artifact layout or application framework. Main receives `EXEC_MODE`, `INFRA_MODE`, and primary internal `PORT`; application code can choose isolated/integrated adapters using `INFRA_MODE`.
