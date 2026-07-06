#!/bin/bash
# PostToolUse hook: Lint edited JS/JSX files to catch undefined vars & scope issues
# Runs after Edit/Write — catches ReferenceErrors before they become blank pages

input=$(cat)

# Extract file path from JSON
filepath=$(echo "$input" | grep -oP '"file_path"\s*:\s*"\K[^"]+' || true)

if [ -z "$filepath" ]; then
  exit 0
fi

# Only lint JS/JSX/TS/TSX files
if echo "$filepath" | grep -qE '\.(js|jsx|ts|tsx)$'; then
  # Use eslint if available
  if command -v npx &>/dev/null && [ -f "node_modules/.bin/eslint" ]; then
    result=$(npx eslint --no-eslintrc --rule '{"no-undef": "error", "no-unused-vars": "warn"}' --parser-options=ecmaVersion:2022,sourceType:module,ecmaFeatures:{jsx:true} "$filepath" 2>&1 || true)
    if echo "$result" | grep -q "error"; then
      echo "LINT HATALARI BULUNDU:"
      echo "$result"
      echo ""
      echo "Lütfen düzeltip devam et."
    fi
  fi
fi

exit 0
