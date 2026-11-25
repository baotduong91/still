import { loopPcm } from "./loop-pcm";
import { defaultAmbientLoop } from "./ambient";

let context: AudioContext | null = null;
let gain: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let buffer: AudioBuffer | null = null;
let epoch = 0;
let offset = 0;
let startedAt = 0;
let targetVolume = 0;
let downloaded: Promise<ArrayBuffer> | null = null;
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
  if (context.state !== "running") await context.resume();
  return context;
}

export async function preloadAmbientLoop() {
  if (!buffer) await downloadLoop();
}

function downloadLoop() {
  downloaded ??= fetch(defaultAmbientLoop)
    .then((response) => {
      if (!response.ok) throw new Error("Ambient loop is unavailable.");
      return response.arrayBuffer();
    })
    .catch((error) => {
      downloaded = null;
      throw error;
    });
  return downloaded;
}

async function loadBuffer(ctx: AudioContext) {
  if (buffer) return buffer;
  if (!loading) {
    loading = downloadLoop()
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
        downloaded = null;
        buffer = seamless;
        return seamless;
      })
      .catch((error) => {
        downloaded = null;
        loading = null;
        throw error;
      });
  }
  return loading;
}

export async function startAmbientLoop(volume: number) {
  const token = epoch;
  setAmbientVolume(volume);
  const ctx = await unlockAmbientAudio();
  if (token !== epoch) return;
  if (!gain) {
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
  }
  await loadBuffer(ctx);
  if (token !== epoch || source) return;
  const next = ctx.createBufferSource();
  next.buffer = buffer;
  next.loop = true;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  next.connect(gain);
  next.start(0, offset % buffer!.duration);
  startedAt = ctx.currentTime;
  source = next;
  applyAmbientVolume(true);
}

export function setAmbientVolume(volume: number) {
  const target = Math.max(0, Math.min(1, volume));
  if (target === targetVolume) return;
  targetVolume = target;
  applyAmbientVolume();
}

function applyAmbientVolume(starting = false) {
  if (!gain || !context || !source) return;
  const param = gain.gain;
  const now = context.currentTime;
  const ducking = targetVolume < param.value;
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(now);
  } else {
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
  }
  // Lower the bed promptly for speech and bring it back more gradually.
  param.linearRampToValueAtTime(
    targetVolume,
    now + (starting ? 0.25 : ducking ? 0.16 : 0.65),
  );
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
