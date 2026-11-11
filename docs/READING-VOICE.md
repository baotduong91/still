# Optional reading aloud

Still’s optional listen controls complement screen readers; they do not replace accessibility tools. `ReadingAudio` accepts a typed app-owned payload; `ScriptureAudio` remains a wrapper for existing passage views. One shared `useReadingAudio` hook owns playback, pause/resume, speed, cancellation, and the `still-reading-audio` event so only one reader can be active app-wide. Step, navigation, payload/engine changes, and PIN-boundary unmount stop playback.

## V1 content and privacy

| Kind | Source and placement | Spoken text | Edge eligibility |
| --- | --- | --- | --- |
| `scripture` | Retrieved `PassageType`: Today Scripture, passage/verse tools, public WEB reader, Create Image, chat citations | Exact retrieved verse text followed by its reference | Auto/Edge online only, after Play |
| `devotional` | Today Reflection: `day.reflection` | App-curated reflection | Never; Kokoro then installed local voice |
| `prayer` | Today Prayer: `day.prayer`, after plan validation | “A prayer inspired by today’s reading. This is not Scripture.” followed by the plan prayer | Never; Kokoro then installed local voice |
| `action` | Today Practice: fixed `day.action` copy | App-curated action | Never; Kokoro then installed local voice |
| `interpretation` | Successful cited chat response’s `interpretation` block | Interpretation only, separate from answer/citations | Never; Kokoro then installed local voice |

`ReadingPayload` is `{ kind, text, reference?, title? }`. `buildSpokenText` centralizes trimming and the prayer prefix while preserving the existing Scripture `readingText` behavior exactly. Titles are not spoken, and non-Scripture references are not added to speech. `engineForKind` is the client privacy gate: only `scripture` may reach Edge. Selecting Edge in Settings does not override the on-device rule for other content. The TTS API contract is unchanged; this feature does not add devotional request kinds to it.

Compact controls provide Play/Pause, Stop, 0.8×–1.2× speed, an engine label, and a private-reading status. Scripture players keep their existing controls and labels. The separate Journey view shows only summaries, user intention, and day titles; its day content opens in Today, where these players are available.

**V1 excludes personal PrayerWriter content, journal entries, notes, typed Practice responses, arbitrary user text, drafts that failed Scripture gates, Settings narration, and whole-screen reading. There is no `user` reading kind and no Play on personal prayer or journal fields.** A generated plan prayer is distinct from the user-written PrayerWriter field. Players never mount for chat interpretation without a cited response.

## Engine choice

Settings → A voice for the Word → Reading voice engine:

- Auto: Scripture uses Edge online, then Kokoro offline/on failure. Other kinds always stay on-device.
- Edge: prefer Jenny online for Scripture only, with the same on-device fallback when unavailable. Other kinds always stay on-device.
- Kokoro: Bella on-device, even when online. It never calls the Edge route.

Edge sends only the Scripture text and reference after Play, through the Still server to Microsoft's online speech service. No automatic request is made on screen load or speed changes. `/api/tts` accepts JSON `{text, reference?, voice?, rate?}`; voices are `en-US-JennyNeural` (default) and `en-US-AriaNeural`, and rate is a number from 0.8 to 1.2. It returns `audio/mpeg`, with `Cache-Control: no-store`, and writes no audio file. Request origin, text length, voice, and rate are checked. Provider failures return 503 for local fallback. The Node runtime is required; no API key is needed by the third-party `node-edge-tts` wrapper. This uses Edge's online service rather than a contracted Azure Speech endpoint; service availability may change independently of Still.

## Prepare offline reading

1. While online, choose Download for offline in Settings to save the PWA and WEB.
2. Under A voice for the Word, choose Download on-device voice. Keep the screen open until Bella is ready. A Cancel control is available.
3. Choose Kokoro for private on-device reading, or leave Auto selected for automatic offline use.

The first download includes model/tokenizer/voice files and speech runtime assets. WebGPU uses the fp32 model (roughly 330 MB); devices without usable WebGPU use the q8 WASM model (roughly 90 MB). Downloads report per-file progress. This is not the percentage of the total multi-file download. A worker keeps computation off the UI thread. Generation is divided at word boundaries to avoid Kokoro's input-token truncation. The model and tokenizer are persisted as static asset blobs in the separate `still-tts-models` IndexedDB database. This avoids large-file Cache Storage failures. Bella voice data uses the library’s small-file browser cache. Settings verifies that a model was stored before claiming offline readiness. Same-origin worker chunks and WASM runtime files are saved by Still's service worker as they load. Runtime files are bundled at build time; no CDN runtime script is needed offline.

Offline reading requires a successful first preparation and retained browser storage. Browser eviction, private browsing, insufficient storage or memory, or a newly changed GPU/backend may require downloading again. If a cached GPU model cannot use WebGPU offline, the worker also tries that fp32 model on WASM. An installed English device voice with `localService=true` is the last resort; OS/cloud voices are excluded from this fallback. Device voice gender/naturalness depends on installed voices. If none is available, the player displays a quiet explanation and leaves the rest of the app usable.

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
