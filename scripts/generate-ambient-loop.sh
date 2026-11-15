#!/usr/bin/env bash
# Warm stereo devotional bed (BibleChat-style dusk pad). Original synthesis — no third-party audio.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/audio/ambient/stillness-v4.mp3"
DUR=52
ffmpeg -y \
  -f lavfi -i "sine=frequency=146.83:duration=${DUR}" \
  -f lavfi -i "sine=frequency=220:duration=${DUR}" \
  -f lavfi -i "sine=frequency=277.18:duration=${DUR}" \
  -f lavfi -i "sine=frequency=349.23:duration=${DUR}" \
  -f lavfi -i "anoisesrc=color=pink:duration=${DUR}:amplitude=0.008" \
  -filter_complex '[0]volume=0.15,lowpass=f=500[a0];[1]volume=0.10,lowpass=f=900[a1];[2]volume=0.07,highpass=f=160[a2];[3]volume=0.06,lowpass=f=1200[a3];[4]lowpass=f=380,volume=0.65[a4];[a0][a1][a2][a3][a4]amix=inputs=5:duration=longest:dropout_transition=3,aphaser=type=t:speed=0.12:decay=0.35,tremolo=f=0.15:d=0.15,afade=t=in:st=0:d=5,afade=t=out:st=47:d=5,loudnorm=I=-16.5:TP=-1.2:LRA=8,aformat=channel_layouts=stereo' \
  -ar 48000 -ac 2 -c:a libmp3lame -b:a 128k "$OUT"
echo "Wrote $OUT"