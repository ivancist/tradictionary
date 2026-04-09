#!/bin/bash
set -e

OLLAMA_HOST="${OLLAMA_BASE_URL:-http://ollama:11434}"
MODEL="${OLLAMA_MODEL:-llama3.2-vision}"

echo "⏳ Waiting for Ollama to be ready at ${OLLAMA_HOST}..."
until curl -sf "${OLLAMA_HOST}/api/tags" > /dev/null 2>&1; do
  sleep 2
done
echo "✅ Ollama is ready."

echo "📦 Checking if model '${MODEL}' is available..."
MODEL_EXISTS=$(curl -sf "${OLLAMA_HOST}/api/tags" | python3 -c "
import sys, json
tags = json.load(sys.stdin)
models = [m['name'] for m in tags.get('models', [])]
print('yes' if any('${MODEL}' in m for m in models) else 'no')
" 2>/dev/null || echo "no")

if [ "$MODEL_EXISTS" = "yes" ]; then
  echo "✅ Model '${MODEL}' already available."
else
  echo "⬇️  Pulling model '${MODEL}'... (this may take a while on first run)"
  curl -sf "${OLLAMA_HOST}/api/pull" -d "{\"name\":\"${MODEL}\"}" | while IFS= read -r line; do
    STATUS=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null || true)
    if [ -n "$STATUS" ]; then
      echo "  → $STATUS"
    fi
  done
  echo "✅ Model '${MODEL}' pulled successfully."
fi

# Execute the main process (e.g., uvicorn)
exec "$@"
