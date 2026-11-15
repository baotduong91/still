import { createLocalVoiceClient } from "./local-voice-client";
import { prepareSpeechRuntime } from "./model-cache";
import { paradeeStored } from "./paradee-model";
import type { SpeechEngine } from "./shared";
export const paradeeVoice = createLocalVoiceClient({
  name: "Paradee",
  sessionKey: "still-paradee-session",
  offlineStored: paradeeStored,
  createWorker: () =>
    new Worker(new URL("./paradee.worker.ts", import.meta.url), {
      type: "module",
    }),
});
export function privateVoice(preference: SpeechEngine) {
  return {
    ...paradeeVoice,
    name: "Paradee",
    label: "Paradee 1.1 · Heart",
    stored: paradeeStored,
  };
}
export function clearPrivatePreviews() {
  paradeeVoice.clear();
}

type DownloadOptions = {
  onWaiting?: (message: string) => void;
  onTimeout?: (extend: () => void) => void;
};

/** Download the static model + speech runtime only; no reading text leaves the device. */
export async function downloadPrivateVoice(
  preference: SpeechEngine,
  signal: AbortSignal,
  progress: (message: string) => void = () => {},
  options?: DownloadOptions,
) {
  if (preference === "device") return { stored: true, backend: "" };
  const voice = privateVoice(preference);
  const [, result] = await Promise.all([
    prepareSpeechRuntime(),
    voice.audio(null, progress, signal, undefined, options),
  ]);
  return { stored: await voice.stored(), backend: result.backend };
}
