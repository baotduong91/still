export type ChunkStrategy = { warmed?: boolean };

function sentenceBreak(words: string[], max: number) {
  let end = Math.min(max, words.length);
  for (
    let i = Math.min(end - 1, max - 1);
    i >= Math.max(4, Math.floor(end / 3));
    i--
  ) {
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
  if (warmed && words.length <= 96 && text.length <= 600) {
    const lead = text.match(/^\s*/)?.[0] ?? "";
    return [lead + words.join("")];
  }
  const firstCap = warmed ? 96 : 22;
  const nextCap = warmed ? 96 : 26;
  const result: string[] = [];
  const cap = (limit: number) => {
    let n = 0,
      chars = 0;
    while (
      n < words.length &&
      n < limit &&
      (chars + words[n].length <= 600 || n === 0)
    )
      chars += words[n++].length;
    return n;
  };
  let firstEnd = sentenceBreak(words, cap(firstCap));
  if (!warmed) firstEnd = Math.min(firstEnd, 22);
  result.push(words.splice(0, firstEnd).join(""));
  while (words.length) {
    const end = sentenceBreak(words, cap(nextCap));
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

/** Join 24 kHz PCM before WAV encoding. Crossfade is opt-in, at most 10 ms. */
export function joinAudio(parts: Float32Array[], crossfadeMs = 0) {
  const overlap = Number.isFinite(crossfadeMs)
    ? Math.round(Math.min(10, Math.max(0, crossfadeMs)) * 24)
    : 0;
  const overlaps = parts.map((part, i) =>
    i
      ? Math.min(
          overlap,
          Math.floor(parts[i - 1].length / 2),
          Math.floor(part.length / 2),
        )
      : 0,
  );
  const result = new Float32Array(
    parts.reduce((n, p, i) => n + p.length - overlaps[i], 0),
  );
  let offset = 0;
  parts.forEach((part, i) => {
    const count = overlaps[i];
    for (let j = 0; j < count; j++) {
      const weight = (j + 1) / (count + 1);
      result[offset - count + j] =
        result[offset - count + j] * (1 - weight) + part[j] * weight;
    }
    result.set(part.subarray(count), offset);
    offset += part.length - count;
  });
  return result;
}
export class SpeechInputTooLong extends Error {}
/** Kokoro's built-in tokenizer otherwise truncates silently at its token limit. */
export function guardSpeechTokenizer<T extends { tokenizer: unknown }>(tts: T) {
  if (typeof tts.tokenizer !== "function") return;
  tts.tokenizer = new Proxy(tts.tokenizer, {
    apply(target, receiver, args) {
      const result = Reflect.apply(target, receiver, [
        args[0],
        { ...args[1], truncation: false },
      ]);
      if ((result.input_ids?.dims?.at(-1) ?? 0) > 510)
        throw new SpeechInputTooLong(
          "Split this speech segment before inference",
        );
      return result;
    },
  });
}
