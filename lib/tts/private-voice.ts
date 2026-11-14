import { bellaVoice } from "./kokoro-client";
import { createLocalVoiceClient } from "./local-voice-client";
import { offlineModelStored } from "./model-cache";
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
  return preference === "paradee"
    ? {
        ...paradeeVoice,
        name: "Paradee",
        label: "Paradee 1.1 · Heart",
        stored: paradeeStored,
      }
    : {
        ...bellaVoice,
        name: "Bella",
        label: "Kokoro · Bella",
        stored: offlineModelStored,
      };
}
export function clearPrivatePreviews() {
  bellaVoice.clear();
  paradeeVoice.clear();
}
