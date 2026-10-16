# Environment ownership

Only main receives Builder `EXEC_MODE`, `INFRA_MODE` and, with a primary endpoint, `PORT`. Ordinary module env applies to all its containers and does not inherit main dotenv. The source/global tester has its own dotenv and effective JSON env; Builder does not inject execution variables there. Mesh extends env wins over a selected main override. E2E gets prod structured env but `.env.e2e`, not `.env.prod`. See [exact precedence](../reference/environment-precedence.md).
