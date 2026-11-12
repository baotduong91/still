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
2. Under A voice for the Word, choose Download on-device voice. Keep the screen open until Bella is ready. A Cancel control is available.
3. Choose Kokoro for private on-device reading, or leave Auto selected for automatic offline use.

Bella uses the q8 WASM model (roughly 90 MB) on all devices. This replaces the earlier roughly 330 MB fp32 WebGPU path, avoiding its large download and unpredictable GPU compilation. A previous full-size model is not used by the optimized reader; prepare the smaller model once while online. The same Bella voice is retained. We favor this predictable mobile path over adding another large model or moving private text to a server. The upstream [model card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) documents the model variants.

Download progress is per file. Cached files say “Loading downloaded Bella” rather than suggesting a fresh download. Model/tokenizer blobs stay in `still-tts-models` IndexedDB; the Bella voice and same-origin worker/WASM files remain cached separately. Settings only claims offline readiness after finding the optimized q8 model and voice. Browser eviction or clearing storage can require downloading again.

The worker emits a short first audio segment (up to ten words) and subsequent segments (up to 24 words) at word/sentence boundaries. Every word and punctuation mark is retained. Playback begins with the first segment while later segments are synthesized, rather than waiting for the entire passage. The player queues segments in order, supports pause/resume across boundaries, and cancels queued audio on Stop, step change, navigation, or PIN locking. Generated audio stays in memory and is not persisted.

A main-thread watchdog terminates an unresponsive worker after 30 seconds of inference per segment, 60 seconds of model loading, or 90 seconds without new download progress. Duplicate status messages cannot prolong a stalled operation. Before speech starts, failure falls back to an installed English device voice with `localService=true`; OS cloud voices remain excluded. A failure after speech starts stops the partial reading and offers an explicit restart rather than silently repeating earlier words. Use the player’s “Use device voice · no download” button to leave preparation immediately, or select Device voice in Settings as a persistent preference. When no local voice exists, the app explains how to install one; it does not silently send private text online.

Kokoro model downloads contact Hugging Face for static assets; the host can see download metadata, but reading text is never sent for inference. Inference and WAV generation run on-device. Static model and voice files are cached, not personal text or generated audio.

On iPhone, a browser may require a second Play tap after audio finishes preparing. Still keeps the prepared audio and shows “Your audio is ready. Tap Play to listen.” Pause/Resume and rate changes use the same audio without another network synthesis request. With the device speech fallback, changing speed stops the current utterance; Play starts it again at the selected speed.

## Development and verification

`npm install`, then `npm run dev` or `npm run build`. Predev/prebuild copies the matching ONNX runtime WASM/MJS files into generated, ignored `public/tts/`. No model is included in the repository or production function bundle. The model downloads only on explicit preparation or when Play needs Kokoro. WEB retrieval, citation validation, AWP actions, and model-provider choices remain separate from speech.

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
