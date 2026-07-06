#!/bin/bash
# PreToolUse hook: Block editing .env files
# Stdin: JSON with tool_name and tool_input

input=$(cat)

# Block any edit/write to .env files
if echo "$input" | grep -qiE '"file_path".*?\.env'; then
  echo "ENGELLENDI: .env dosyasina dokunulamaz. Secrets elle yonetilmeli."
  exit 1
fi

exit 0
