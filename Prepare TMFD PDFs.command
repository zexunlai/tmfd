#!/bin/bash
set -u

REPOSITORY="$(cd "$(dirname "$0")" && pwd)"
TOOLS_DIRECTORY="$HOME/Documents/TMFD PDF Tools"
PYTHON="$TOOLS_DIRECTORY/.venv/bin/python3"

if [ ! -x "$PYTHON" ]; then
  echo "TMFD PDF Tools is not installed yet. Please ask Codex to set it up again."
  read -r -n 1 -p "Press any key to close..."
  exit 1
fi

"$PYTHON" "$REPOSITORY/scripts/prepare-pdfs.py" "$REPOSITORY"
STATUS=$?

if [ "$STATUS" -eq 0 ]; then
  open -a "GitHub Desktop" "$REPOSITORY"
  osascript -e 'display notification "Your PDFs are ready for GitHub Desktop." with title "TMFD"' 2>/dev/null || true
fi

echo
read -r -n 1 -p "Press any key to close..."
echo
exit "$STATUS"
