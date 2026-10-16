# Services and mesh roots

A build declares possible services. `main` is the standalone root; ordinary modules start only when requisites reach them in an integrated profile. `tester` is a special separate Compose runner, not a regular graph target. A mesh imports complete source builds; every effective top-level source becomes a root in mesh dev/prod/global E2E. A source still runs independently with its own `build.json`. Mesh `extends` rewrites existing source-local declarations explicitly. See [build](../reference/build-json.md) and [mesh](../reference/mesh-json.md) reference.
