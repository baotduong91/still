export type ChunkStrategy = { warmed?: boolean };

function sentenceBreak(words: string[], max: number) {
  let end = Math.min(max, words.length);
  for (let i = Math.min(end - 1, max - 1); i >= Math.max(4, Math.floor(end / 3)); i--) {
    if (/[.!?][”’"')]*\s*$/.test(words[i])) return i + 1;
  }
  return end;
}

// Short first segment reduces time to first sound when cold; warmed and short
// passages use fewer, larger segments to avoid pauses between syntheses.
export function speechChunks(text: string, strategy: ChunkStrategy = {}) {
  const words = text.match(/\S+\s*/g) ?? [];
  if (!words.length) return [];
  const warmed = !!strategy.warmed;
  if (warmed && words.length <= 58) {
    const lead = text.match(/^\s*/)?.[0] ?? "";
    return [lead + words.join("")];
  }
  const firstCap = warmed ? 34 : 22;
  const nextCap = warmed ? 40 : 26;
  const result: string[] = [];
  let firstEnd = sentenceBreak(words, Math.min(firstCap, words.length));
  if (!warmed) firstEnd = Math.min(firstEnd, 22);
  result.push(words.splice(0, firstEnd).join(""));
  while (words.length) {
    const end = sentenceBreak(words, Math.min(nextCap, words.length));
    result.push(words.splice(0, end).join(""));
  }
  result[0] = (text.match(/^\s*/)?.[0] ?? "") + result[0];
  return result;
}

export function wavBytes(samples: Float32Array) {
  const wav = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(wav);
  const str = (i: number, s: string) => {
    for (let j = 0; j < s.length; j++) view.setUint8(i + j, s.charCodeAt(j));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) =>
    view.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(1, s)) * (s < 0 ? 32768 : 32767),
      true,
    ),
  );
  return wav;
}
