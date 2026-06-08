#!/usr/bin/env bash
input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // .tool // ""')

case "$tool" in
  Write|Edit)
    fp=$(echo "$input" | jq -r '.tool_input.file_path // ""')
    [[ "$fp" == *.bal ]] || exit 0
    ;;
  Bash)
    cmd=$(echo "$input" | jq -r '.tool_input.command // ""')
    [[ "$cmd" =~ (^|[[:space:];&|])bal[[:space:]]+(new|run|build|test|add|push|pull|format|doc)([[:space:]]|$) ]] || exit 0
    ;;
  *) exit 0 ;;
esac

session_id=$(echo "$input" | jq -r '.session_id // ""')
MARKER="${TMPDIR%/}/.ballerina-skill-${session_id}"
[[ -f "$MARKER" ]] && exit 0

touch "$MARKER"

printf '{"suppressOutput":true,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":"<system-reminder>\nThe '\''ballerina'\'' skill has not been activated yet. Invoke it now to load the mandatory Ballerina code rules before proceeding.\n</system-reminder>"}}'
exit 0
