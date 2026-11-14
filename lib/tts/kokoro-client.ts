import { createLocalVoiceClient } from "./local-voice-client";
import { offlineModelStored } from "./model-cache";
export {
  kokoroAutoExtends,
  kokoroTimeouts,
  LocalVoiceTimeoutError as KokoroTimeoutError,
} from "./local-voice-client";
export type { KokoroPhase } from "./local-voice-client";
export const bellaVoice = createLocalVoiceClient({
  name: "Bella",
  sessionKey: "still-bella-session",
  offlineStored: offlineModelStored,
  createWorker: () =>
    new Worker(new URL("./kokoro.worker.ts", import.meta.url), {
      type: "module",
    }),
  preferGpu: () =>
    typeof localStorage !== "undefined" &&
    localStorage.getItem("still-bella-gpu") === "true",
});
export const {
  audio: kokoroAudio,
  prime: primeKokoro,
  prepared: preparedKokoro,
  warm: warmKokoro,
  clear: clearKokoroPreviews,
  reset: resetBellaBackend,
  backend: bellaBackend,
  sessionPrepared: bellaSessionPrepared,
} = bellaVoice;
