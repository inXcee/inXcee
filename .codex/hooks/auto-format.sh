#!/bin/bash
# PostToolUse hook: Auto-format edited files
# Stdin: JSON with tool_name and tool_input

input=$(cat)

# Extract file path from JSON
filepath=$(echo "$input" | grep -oP '"file_path"\s*:\s*"\K[^"]+' || true)

if [ -z "$filepath" ]; then
  exit 0
fi

# Only format JS/TS/JSX/TSX/CSS files
if echo "$filepath" | grep -qE '\.(js|ts|jsx|tsx|css|json)$'; then
  # Use prettier if available
  if command -v npx &>/dev/null && [ -f "node_modules/.bin/prettier" ]; then
    npx prettier --write "$filepath" 2>/dev/null
  fi
fi

exit 0
