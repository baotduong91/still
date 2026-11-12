# Optional reading aloud

Still’s optional listen controls complement screen readers; they do not replace accessibility tools. `ReadingAudio` accepts a typed app-owned payload; `ScriptureAudio` remains a wrapper for existing passage views. One shared `useReadingAudio` hook owns playback, pause/resume, speed, cancellation, and the `still-reading-audio` event so only one reader can be active app-wide. Section, navigation, payload/engine changes, and PIN-boundary unmount stop playback.

## V1 content and privacy

| Kind | Source and placement | Spoken text | Edge eligibility |
| --- | --- | --- | --- |
| `scripture` | Retrieved `PassageType`: Today Scripture, passage/verse tools, public WEB reader, Create Image, chat citations | Exact retrieved verse text followed by its reference | Auto/Edge online only, after Play |
| `devotional` | Today Reflection: `day.reflection` | Validated plan reflection, guided or generated | Never; Kokoro then installed local voice |
| `prayer` | Today Prayer: `day.prayer`, after plan validation | “A prayer inspired by today’s reading. This is not Scripture.” followed by the plan prayer | Never; Kokoro then installed local voice |
| `action` | Today Practice: fixed `day.action` copy | Validated plan action, guided or generated | Never; Kokoro then installed local voice |
| `interpretation` | Successful cited chat response’s `interpretation` block | Interpretation only, separate from answer/citations | Never; Kokoro then installed local voice |

`ReadingPayload` is `{ kind, text, reference?, title? }`. `buildSpokenText` centralizes trimming and the prayer prefix while preserving the existing Scripture `readingText` behavior exactly. Titles are not spoken, and non-Scripture references are not added to speech. `engineForKind` is the client privacy gate: only `scripture` may reach Edge. Selecting Edge in Settings does not override the on-device rule for other content. The TTS API still accepts only text/reference and voice controls; this feature does not add devotional request kinds to it. The optional `stream` flag enables progressive MP3 delivery.

Compact controls provide Play/Pause, Stop, 0.8×–1.2× speed, an engine label, and a private-reading status. Scripture players keep their existing controls and labels. The separate Journey view shows only summaries, user intention, and day titles; its day content opens in Today, where these players are available.

**V1 excludes personal PrayerWriter content, journal entries, notes, typed Practice responses, arbitrary user text, drafts that failed Scripture gates, Settings narration, and whole-screen reading. There is no `user` reading kind and no Play on personal prayer or journal fields.** A generated plan prayer is distinct from the user-written PrayerWriter field. Players never mount for chat interpretation without a cited response.

## Engine choice

Settings → A voice for the Word → Reading voice engine:

- Auto: Scripture uses Edge online, then Kokoro offline/on failure. Other kinds always stay on-device.
- Edge: prefer Jenny online for Scripture only, with the same on-device fallback when unavailable. Other kinds always stay on-device.
- Kokoro: Bella on-device, even when online. It never calls the Edge route.
- Device voice: use an installed local English voice immediately, with no model download. Voice quality and availability depend on the device. This preference also applies to devotional content; it never uses Edge.

Edge sends only the Scripture text and reference after Play, through the Still server to Microsoft's online speech service. No speech text is sent on screen load or speed changes; Today may send a text-free HEAD request to warm the route. `/api/tts` accepts JSON `{text, reference?, voice?, rate?, stream?}`; voices are `en-US-JennyNeural` (default) and `en-US-AriaNeural`, and rate is a number from 0.8 to 1.2. It returns `audio/mpeg`, with `Cache-Control: no-store`, and writes no audio file. Request origin, text length, voice, and rate are checked. Provider failures return 503 for local fallback. The Node runtime is required; no API key is needed by the third-party `node-edge-tts` wrapper. This uses Edge's online service rather than a contracted Azure Speech endpoint; service availability may change independently of Still.

## Prepare offline reading

1. While online, choose Download for offline in Settings to save the PWA and WEB.
2. Under A voice for the Word, choose Download on-device voice. Keep the screen open until Bella is ready: after download, first synthesis can take 1–3 minutes on desktop. Keep waiting extends a slow preparation once; Cancel stops that request and retains downloaded files.
3. Choose Kokoro for private on-device reading, or leave Auto selected for automatic offline use.

Bella uses the q8 WASM model (roughly 90 MB) on all devices. This replaces the earlier roughly 330 MB fp32 WebGPU path, avoiding its large download and unpredictable GPU compilation. A previous full-size model is not used by the optimized reader; prepare the smaller model once while online. The same Bella voice is retained. We favor this predictable mobile path over adding another large model or moving private text to a server. The upstream [model card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) documents the model variants.

Download progress is per file. Cached files say “Loading downloaded Bella” rather than suggesting a fresh download. Model/tokenizer blobs stay in `still-tts-models` IndexedDB; the Bella voice and same-origin worker/WASM files remain cached separately. Settings only claims offline readiness after finding the optimized q8 model and voice. Browser eviction or clearing storage can require downloading again.

Cold playback uses a modest first segment (up to about 22 words, often ending at a sentence) so the first sound arrives quickly; warmed playback uses larger segments, and passages under about 58 words are usually read as one continuous segment to avoid mid-sentence pauses. Every word and punctuation mark is retained. While one segment plays, the worker synthesizes the next; the player schedules segments back-to-back with Web Audio when buffers are ready, supports pause/resume, and cancels on Stop, step change, navigation, or PIN locking. Generated audio stays in memory and is not persisted.

Bella has separate budgets: **120 seconds without download progress**, **120 seconds without model-load progress**, **180 seconds for the first successful synthesis in a worker session**, and **45 seconds per subsequent synthesis chunk**. The first ONNX/WASM synthesis can take **1–3 minutes on desktop**, even when all model files have already downloaded. Settings preparation and Today’s cached-model warmup both run one `generate("Ready.")` to compile those paths before reporting ready. The worker remembers successful compilation for its entire lifetime; Stop and section changes do not discard it. WASM stays q8; two threads are used only when the browser is cross-origin isolated and has at least four logical cores. Ordinary non-isolated hosted pages keep one thread.

While a job is queued, downloading, loading, or generating, the worker sends a heartbeat every five seconds. A heartbeat renews the liveness watchdog even if its message text is unchanged. Separate inference deadlines apply; long queued work is not charged as warm inference.

After Bella’s files are saved, the app **warms** the WASM model in the background (app launch and before Play when possible). A session flag remembers successful compile in this browser tab so the next Play reuses the worker when still open.

Before any sound, **Play once** keeps preparing: the client **automatically extends** the same job several times (several minutes total on first synthesis) and updates status text—no repeated Play taps for each timeout window. After those automatic extensions, **Keep waiting** offers one more manual extension on the same job. Device voice requires an explicit button tap or the persistent Device voice preference; a timeout never silently switches to a system voice. A genuine worker/model error is retried once before showing an explicit choice. A failure after sound starts stops the partial reading and offers a restart instead of repeating words automatically.

Cancellation is cooperative: ONNX cannot safely interrupt an in-flight native generate. Stop/timeout/clear marks the individual job cancelled immediately, removes its listeners/timers, and suppresses late audio/cache writes and subsequent chunks. The single serial worker queue finishes that native call before running another, so generations never overlap. Only an unrecoverable worker error terminates the worker. Clearing Today’s previews cancels pending warm/prime jobs without cancelling an unrelated active read. Installed fallback voices must have `localService=true`; OS cloud voices remain excluded. When no local voice exists, the app explains how to install one. Devotional text never goes to Edge.


Kokoro model downloads contact Hugging Face for static assets; the host can see download metadata, but reading text is never sent for inference. Inference and WAV generation run on-device. Static model and voice files are cached, not personal text or generated audio.

On iPhone, a browser may require a second Play tap after audio finishes preparing. Still keeps the prepared audio and shows “Your audio is ready. Tap Play to listen.” Pause/Resume and rate changes use the same audio without another network synthesis request. With the device speech fallback, changing speed stops the current utterance; Play starts it again at the selected speed.

## Development and verification

`npm install`, then `npm run dev` or `npm run build`. Predev/prebuild copies and validates the matching ONNX runtime WASM/MJS files in generated, ignored `public/tts/`. `vercel.json` explicitly selects `npm run build` so dashboard commands that directly invoke `next build` cannot skip this preparation. The production smoke test checks `/tts/ort-wasm-simd-threaded.jsep.mjs` and the WASM magic bytes at `/tts/ort-wasm-simd-threaded.jsep.wasm`; the worker’s `wasmPaths` always uses its own origin. No model is included in the repository or production function bundle. The model downloads only on explicit preparation or when Play needs Kokoro. WEB retrieval, citation validation, AWP actions, and model-provider choices remain separate from speech.

Unit checks assert exact Scripture input, `buildSpokenText` behavior, the full kind/preference/connectivity routing matrix, and API validation/errors. Browser fixtures cover tap-only Scripture network access, private Today and chat playback with Auto online, prayer prefix and personal-field exclusion, step/payload changes, the global reader mutex, PIN unmount, engine preference, and local fallback. An optional real-inference test downloads the model and checks offline reload:

```bash
npm run build
TEST_REAL_TTS=1 npm run test:e2e -- audio-runtime.spec.ts
```

Sources: [Kokoro.js](https://github.com/hexgrad/kokoro/tree/main/kokoro.js), [node-edge-tts](https://github.com/SchneeHertz/node-edge-tts).


## Continuous Today journey and readiness

Today renders Verse → Reflection → Prayer → Practice as one vertical page, with a mountain-backed verse card and a single minimal fixed player above mobile navigation. Section links and Continue controls scroll within the page and respect reduced motion. Passive viewport tracking selects the current section; changing sections cancels the previous reading. Natural completion scrolls toward the next section but never autoplays it. Personal prayer and typed Practice fields stay mounted while scrolling; only the plan's fixed day copy can be narrated. PIN locking and navigation still unmount/cancel the reader.

Shortly after Today’s first paint, a deferred task warms already downloaded Bella assets. It never initiates a model download on page load. The first segment of each app-owned reflection, plan prayer, and fixed action is prepared on-device and held in a bounded in-memory cache. Play can consume that segment synchronously, while the worker generates the remaining segments. Nothing is spoken during preparation. This memory cache is cleared when Today exits. Cold devices still need an explicit download/first-use setup; an installed local voice remains available immediately.

For online Scripture, Today sends a text-free HEAD request to warm the Next.js runtime. Only Play sends the exact displayed text/reference in a POST. With `stream:true`, the server returns MP3 bytes as soon as the first audio chunk arrives. Browsers supporting MediaSource `audio/mpeg` append those bytes progressively; other browsers retain buffered MP3 playback. Successfully played Scripture audio is cached only in the reader’s memory for immediate replay and is cleared on unmount. No new persistent personal audio cache is introduced. Network and cold-start latency cannot be eliminated, so the player keeps its quiet loading state and explicit device-voice fallback.

Tests cover four simultaneously mounted sections, typed response retention across scrolling, active-section engine selection, natural-completion scrolling without autoplay, private text staying off Edge, first-byte MP3 delivery, and warm Bella's synchronous first segment. The opt-in real-runtime checks also measure warm Today latency and decode an actual Edge MP3 with browser output muted.

Production diagnosis (November 11, 2026): deployment `56acd22` served both runtime URLs as 404. Its Vercel build log directly ran Prisma and `next build`, bypassing `npm run prebuild`. The committed build configuration fixes that omission for the next deployment; production needs this commit deployed before those URLs change. After deploying, check both runtime URLs return 200 (or 206 for a range request), not an HTML 404.
