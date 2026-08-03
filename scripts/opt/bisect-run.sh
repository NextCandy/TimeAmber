#!/usr/bin/env bash
set -euo pipefail

metric=""
threshold=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --metric) metric="$2"; shift 2 ;;
    --threshold) threshold="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ -z "$metric" || -z "$threshold" ]]; then
  echo "usage: scripts/opt/bisect-run.sh --metric PAGE/VIEWPORT/SCENARIO/METRIC --threshold VALUE" >&2
  exit 125
fi

node scripts/opt/bisect-run.mjs --metric "$metric" --threshold "$threshold"
