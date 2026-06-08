#!/usr/bin/env bash
input=$(cat)
skill=$(echo "$input" | jq -r '.tool_input.skill // .tool_input.name // ""')
[[ "$skill" == "ballerina" ]] || exit 0

session_id=$(echo "$input" | jq -r '.session_id // ""')
[[ -z "$session_id" ]] && exit 0

MARKER="${TMPDIR%/}/.ballerina-skill-${session_id}"
touch "$MARKER"
exit 0
