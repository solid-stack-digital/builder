# Order ordinary modules

If `api` needs `db`, set `services.api.requisites.db` to `"dependency"`. When a root reaches `api`, both modules materialize; `api` waits for `db` representative health. For a one-shot migration job, use `"prerequisite"` and require exit 0. Native internal Compose `depends_on` inside each atomic module remains in place. An ordering cycle among dependency/prerequisite edges fails; requirement-only cycles are allowed. See [readiness](../concepts/lifecycle-and-readiness.md).
