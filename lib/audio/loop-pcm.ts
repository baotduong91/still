/** Circular crossfade removes MP3 boundary padding and discontinuities. */
export function loopPcm(input: Float32Array, sampleRate: number) {
  const overlap = Math.min(
    Math.round(sampleRate * 0.35),
    Math.floor(input.length / 4),
  );
  if (overlap < 2) return input.slice();
  const output = input.slice(overlap);
  const start = output.length - overlap;
  for (let i = 0; i < overlap; i++) {
    const blend = 0.5 - 0.5 * Math.cos((Math.PI * i) / (overlap - 1));
    output[start + i] =
      input[input.length - overlap + i] * (1 - blend) + input[i] * blend;
  }
  return output;
}
