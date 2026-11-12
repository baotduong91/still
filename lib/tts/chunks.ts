// Short first segment reduces time to first sound; subsequent segments retain
// sentence boundaries where possible and never remove or rewrite words.
export function speechChunks(text: string) {
  const words = text.match(/\S+\s*/g) ?? [];
  const result: string[] = [];
  while (words.length) {
    const limit = result.length ? 24 : 10;
    let end = Math.min(limit, words.length);
    for (let i = end - 1; i >= Math.floor(end / 2); i--) {
      if (/[.!?][”’"')]*\s*$/.test(words[i])) {
        end = i + 1;
        break;
      }
    }
    result.push(words.splice(0, end).join(""));
  }
  if (result.length) result[0] = (text.match(/^\s*/)?.[0] ?? "") + result[0];
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
