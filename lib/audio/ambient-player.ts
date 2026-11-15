import { loopPcm } from "./loop-pcm";
import { defaultAmbientLoop } from "./ambient";

let context: AudioContext | null = null;
let gain: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let buffer: AudioBuffer | null = null;
let epoch = 0;
let offset = 0;
let startedAt = 0;
let loading: Promise<AudioBuffer> | null = null;

export async function unlockAmbientAudio(): Promise<AudioContext> {
  if (!context || context.state === "closed") {
    const session = (
      navigator as Navigator & { audioSession?: { type: string } }
    ).audioSession;
    if (session) {
      try {
        session.type = "playback";
      } catch {}
    }
    context = new AudioContext();
    gain = null;
    source = null;
  }
  if (context.state !== "running") await context.resume().catch(() => {});
  return context;
}

async function loadBuffer(ctx: AudioContext) {
  if (buffer) return buffer;
  if (!loading) {
    loading = fetch(defaultAmbientLoop)
      .then((response) => {
        if (!response.ok) throw new Error("Ambient loop is unavailable.");
        return response.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((decoded) => {
        const channels = Array.from(
          { length: decoded.numberOfChannels },
          (_, i) => loopPcm(decoded.getChannelData(i), decoded.sampleRate),
        );
        const seamless = ctx.createBuffer(
          decoded.numberOfChannels,
          channels[0].length,
          decoded.sampleRate,
        );
        channels.forEach((channel, i) =>
          seamless.getChannelData(i).set(channel),
        );
        buffer = seamless;
        return seamless;
      })
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

export async function startAmbientLoop(volume: number) {
  const token = epoch;
  const ctx = await unlockAmbientAudio();
  if (token !== epoch) return;
  if (!gain) {
    gain = ctx.createGain();
    gain.connect(ctx.destination);
  }
  setAmbientVolume(volume);
  await loadBuffer(ctx);
  if (token !== epoch || source) return;
  const next = ctx.createBufferSource();
  next.buffer = buffer;
  next.loop = true;
  next.connect(gain);
  next.start(0, offset % buffer!.duration);
  startedAt = ctx.currentTime;
  source = next;
}

export function setAmbientVolume(volume: number) {
  if (gain && context) {
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(
      Math.max(0, Math.min(1, volume)),
      now + 0.15,
    );
  }
}

export function stopAmbientLoop() {
  epoch++;
  if (source) {
    offset =
      buffer && context
        ? (offset + context.currentTime - startedAt) % buffer.duration
        : 0;
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    source.disconnect();
    source = null;
  }
}

export async function keepAmbientAlive(volume: number) {
  if (!source) {
    await startAmbientLoop(volume);
    return;
  }
  const ctx = await unlockAmbientAudio();
  setAmbientVolume(volume);
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
}
