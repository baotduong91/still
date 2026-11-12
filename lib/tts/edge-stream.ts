// MP3 streaming is feature-detected. Browsers without MSE MP3 support use the
// existing buffered file path; no UA sniffing or third-party audio upload.
export function supportsMp3Stream() {
  return (
    typeof MediaSource !== "undefined" &&
    MediaSource.isTypeSupported("audio/mpeg")
  );
}
function waitFor(target: EventTarget, event: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      target.removeEventListener(event, done);
      target.removeEventListener("error", error);
      signal.removeEventListener("abort", cancel);
    };
    const done = () => {
        cleanup();
        resolve();
      },
      error = () => {
        cleanup();
        reject(new Error("Audio stream could not be decoded"));
      },
      cancel = () => {
        cleanup();
        reject(new DOMException("Cancelled", "AbortError"));
      };
    const timeout = setTimeout(error, 6000);
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", error, { once: true });
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
export async function streamMp3(
  response: Response,
  player: HTMLAudioElement,
  signal: AbortSignal,
  callbacks: {
    url: (url: string) => void;
    playing: () => void;
    blocked: () => void;
  },
) {
  if (!response.body) throw new Error("Empty audio stream");
  const media = new MediaSource(),
    url = URL.createObjectURL(media),
    reader = response.body.getReader(),
    parts: Uint8Array<ArrayBuffer>[] = [];
  callbacks.url(url);
  let start: Promise<void> | null = null;
  try {
    const opened = waitFor(media, "sourceopen", signal);
    void opened.catch(() => {});
    player.src = url;
    player.load();
    await opened;
    const buffer = media.addSourceBuffer("audio/mpeg");
    while (true) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      const part = new Uint8Array(value);
      parts.push(part);
      const appended = waitFor(buffer, "updateend", signal);
      void appended.catch(() => {});
      buffer.appendBuffer(part);
      await appended;
      if (!start) {
        start = player
          .play()
          .then(callbacks.playing)
          .catch((error) => {
            if ((error as Error).name === "NotAllowedError")
              callbacks.blocked();
            else throw error;
          });
        void start.catch(() => {});
      }
    }
    if (media.readyState === "open") media.endOfStream();
    if (!parts.length) throw new Error("Empty audio stream");
    await start;
    return new Blob(parts, { type: "audio/mpeg" });
  } catch (error) {
    // A stream can fail while play() is still pending. Detach it before a local
    // fallback starts so the late online player cannot speak over Bella.
    player.pause();
    player.removeAttribute("src");
    player.load();
    await reader.cancel().catch(() => {});
    throw error;
  }
}
