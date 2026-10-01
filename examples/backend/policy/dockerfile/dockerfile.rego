package main

import rego.v1

# ---------------------------------------------------------------------------
# AST PARSER HELPER: Maps every Dockerfile line to its specific stage name
# ---------------------------------------------------------------------------
stage_at_index[i] := alias if {
    some i
    _ = input[i]
    
    # Find the closest "FROM" command preceding this instruction
    j := max({ k | input[k].Cmd == "from"; k <= i })
    
    # Extract the alias (e.g., "FROM node AS prod" -> "prod")
    val := input[j].Value
    lower(val[count(val)-2]) == "as"
    alias := val[count(val)-1]
}

# Find all stages defined in the file
found_stages := { alias | alias := stage_at_index[_] }

# ---------------------------------------------------------------------------
# RULE 1: The Multi-Stage Target Aliases
# ---------------------------------------------------------------------------
deny contains msg if {
    required_stages := {"dev", "test", "test-e2e", "prod"}
    missing := required_stages - found_stages
    count(missing) > 0
    
    msg := sprintf("❌ Rule 1 Failed: Missing required stages %v", [missing])
}

# ---------------------------------------------------------------------------
# RULE 2: Dynamic Port Ingestion (No Hardcoded EXPOSE)
# ---------------------------------------------------------------------------
deny contains msg if {
    some i
    input[i].Cmd == "expose"
    
    msg := "❌ Rule 2 Failed: Hardcoded EXPOSE found. Orchestrator manages ports via ${PORT}."
}

# ---------------------------------------------------------------------------
# RULE 3: Native OS/Runtime Healthchecks in Prod
# ---------------------------------------------------------------------------
deny contains msg if {
    "prod" in found_stages
    
    # Look for a healthcheck specifically inside the 'prod' stage
    healthchecks := { i | input[i].Cmd == "healthcheck"; stage_at_index[i] == "prod" }
    count(healthchecks) == 0
    
    msg := "❌ Rule 3 Failed: Stage [prod] is missing a native HEALTHCHECK directive."
}

# ---------------------------------------------------------------------------
# RULE 4: Absolute Artifact Isolation in Prod
# ---------------------------------------------------------------------------
deny contains msg if {
    "prod" in found_stages
    
    # Ensure there is at least one COPY --from= in the prod stage
    copies := { i | 
        input[i].Cmd == "copy"
        stage_at_index[i] == "prod"
        startswith(input[i].Flags[_], "--from=")
    }
    count(copies) == 0
    
    msg := "❌ Rule 4 Failed: Stage [prod] must use 'COPY --from=' to isolate artifacts."
}

# ---------------------------------------------------------------------------
# RULE 5: Foreground Process Control (Anti-patterns)
# ---------------------------------------------------------------------------
deny contains msg if {
    some i
    input[i].Cmd in {"run", "cmd"}
    
    # Combine the command array into a single string for regex checking
    val := concat(" ", input[i].Value)
    
    # Use \\s for whitespace to exactly match the JS behavior
    regex.match("(nohup\\s+|pm2\\s+start.*--daemon|&\\s*$)", val)
    
    msg := "❌ Rule 5 Failed: Background process anti-pattern detected. App must run in foreground."
}

# ---------------------------------------------------------------------------
# RULE 6: Dev Stage Boot Behavior
# ---------------------------------------------------------------------------
deny contains msg if {
    "dev" in found_stages
    
    cmds := { i | input[i].Cmd == "cmd"; stage_at_index[i] == "dev" }
    count(cmds) == 0
    
    msg := "❌ Contract Violation: Stage [dev] is missing a default CMD instruction."
}