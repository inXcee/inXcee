#!/bin/bash
# PreToolUse hook: Block dangerous bash commands
# Stdin: JSON with tool_name and tool_input

input=$(cat)

# Dangerous patterns that should NEVER run
if echo "$input" | grep -qiE '"command".*?(rm\s+-rf\s+/[^.]|drop\s+table|truncate\s+table|format\s+c:|del\s+/[fs]\s+/[fs]|git\s+push\s+--force\s+origin\s+main|git\s+reset\s+--hard\s+origin)'; then
  echo "ENGELLENDI: Tehlikeli komut tespit edildi. Bu komut calistirilmayacak."
  exit 1
fi

exit 0
