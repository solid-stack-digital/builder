package main

import rego.v1

# Conftest supplies Dockerfile instructions in source order.
from_indices := {i | some i; input[i].Cmd == "from"}
alias_at[i] := lower(input[i].Value[count(input[i].Value)-1]) if {
  i in from_indices
  value := input[i].Value
  count(value) >= 3
  lower(value[count(value)-2]) == "as"
}
stages := {a | a := alias_at[_]}
stage_alias[n] := alias_at[i] if { some i; n := input[i].Stage; alias_at[i] }
stage_at[i] := stage_alias[input[i].Stage] if { some i; _ := input[i] }
parent[a] := lower(input[i].Value[0]) if {
  some i
  a := alias_at[i]
  lower(input[i].Value[0]) in stages
}
edges := {a: neighbors | some i; a := alias_at[i]; neighbors := [p | p := parent[a]]}
lineage[a] := graph.reachable(edges, {a}) | {a} if { some i; a := alias_at[i] }
commands[a] := {i | some i; stage_at[i] in lineage[a]; input[i].Cmd == "cmd"} if { some j; a := alias_at[j] }
runtime_instruction_indices[a] := {i | some i; stage_at[i] in lineage[a]; input[i].Cmd in {"cmd", "entrypoint"}} if { some j; a := alias_at[j] }
has_runtime_instruction(a) if { count(runtime_instruction_indices[a]) > 0 }
healthcheck_indices[a] := {i | some i; stage_at[i] in lineage[a]; input[i].Cmd == "healthcheck"} if { some j; a := alias_at[j] }
effective_healthcheck_index[a] := max(indices) if { indices := healthcheck_indices[a]; count(indices) > 0 }
effective_healthcheck_value[a] := lower(concat(" ", input[index].Value)) if { index := effective_healthcheck_index[a] }
has_valid_effective_healthcheck(a) if { value := effective_healthcheck_value[a]; value != "none" }
deny contains msg if {
  missing := {"dev", "test", "prod"} - stages
  count(missing) > 0
  msg := sprintf("Missing required Dockerfile stages: %v", [missing])
}
deny contains "dev stage requires an effective CMD or ENTRYPOINT" if { "dev" in stages; not has_runtime_instruction("dev") }
deny contains "test stage requires an effective CMD or ENTRYPOINT" if { "test" in stages; not has_runtime_instruction("test") }
deny contains "prod stage requires an effective CMD or ENTRYPOINT" if { "prod" in stages; not has_runtime_instruction("prod") }
deny contains "dev stage requires a valid HEALTHCHECK" if { "dev" in stages; not has_valid_effective_healthcheck("dev") }
deny contains "prod stage requires a valid HEALTHCHECK" if { "prod" in stages; not has_valid_effective_healthcheck("prod") }
deny contains msg if {
  some i
  a := alias_at[i]
  p := parent[a]
  a in lineage[p]
  msg := sprintf("Dockerfile stage inheritance cycle at %s", [a])
}
deny contains msg if {
  some i
  input[i].Cmd in {"cmd", "entrypoint"}
  command := lower(concat(" ", input[i].Value))
  regex.match("(^|[ ;])nohup[ ;]|&[[:space:]]*$|pm2[[:space:]]+start.*--daemon|nginx(.*[[:space:]])?-g[[:space:]]*['\"]?daemon[[:space:]]+on", command)
  msg := sprintf("Runtime CMD/ENTRYPOINT must remain in foreground (instruction %v)", [i])
}
deny contains msg if {
  some i
  input[i].Cmd in {"cmd", "entrypoint"}
  command := lower(concat(" ", input[i].Value))
  regex.match("(^|[ ;])nginx([ ;]|$)", command)
  not contains(command, "daemon off")
  msg := sprintf("nginx CMD/ENTRYPOINT must use daemon off (instruction %v)", [i])
}
