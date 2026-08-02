#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <count> [delay_seconds]" >&2
  echo "  API_BASE_URL env var overrides http://localhost:3000" >&2
  exit 1
}

[[ $# -lt 1 || $# -gt 2 ]] && usage

count="$1"
delay="${2:-0}"
base_url="${API_BASE_URL:-http://localhost:3000}"

[[ "$count" =~ ^[0-9]+$ ]] || usage

song_ids=(1 2 3)
invalid_song_id=9999
invalid_rate=10 # roughly 1 in 10 plays targets a nonexistent song, to exercise error handling

pick_song_id() {
  if (( RANDOM % invalid_rate == 0 )); then
    echo "$invalid_song_id"
  else
    echo "${song_ids[$((RANDOM % ${#song_ids[@]}))]}"
  fi
}

ok=0
failed=0

echo "sending $count play(s) to $base_url across songs (${song_ids[*]}, plus occasional invalid id $invalid_song_id)"

for ((i = 1; i <= count; i++)); do
  song_id=$(pick_song_id)
  status=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base_url/api/song/$song_id/play")
  if [[ "$status" == 2* ]]; then
    ((ok++))
  else
    ((failed++))
    echo "play $i for song $song_id failed: HTTP $status" >&2
  fi
  (( $(awk "BEGIN {print ($delay > 0)}") )) && sleep "$delay"
done

echo "done — ok: $ok, failed: $failed"
