#!/usr/bin/env bash
# PhonZz — Angelic Pad Loop (Freesound 242773, CC0). 64 bars @ 120 bpm ≈ 128 s.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${TMPDIR:-/tmp}/angelic-pad-242773-hq.mp3"
OUT="$ROOT/public/audio/ambient/angelic-pad-loop.mp3"
URL="https://cdn.freesound.org/previews/242/242773_3946286-hq.mp3"
curl -fsSL -o "$SRC" "$URL"
ffmpeg -y -t 128 -i "$SRC" \
  -af "afade=t=in:st=0:d=2,afade=t=out:st=126:d=2,loudnorm=I=-17:TP=-1.5:LRA=9" \
  -ar 48000 -ac 2 -c:a libmp3lame -b:a 128k "$OUT"
rm -f "$SRC"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"