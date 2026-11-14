# Optional reading aloud

Still’s optional listen controls complement screen readers; they do not replace accessibility tools. `ReadingAudio` accepts a typed app-owned payload; `ScriptureAudio` remains a wrapper for existing passage views. One shared `useReadingAudio` hook owns playback, pause/resume, speed, cancellation, and the `still-reading-audio` event so only one reader can be active app-wide. Section, navigation, payload/engine changes, and PIN-boundary unmount stop playback.

## V1 content and privacy

| Kind | Source and placement | Spoken text | Edge eligibility |
| --- | --- | --- | --- |
| `scripture` | Retrieved `PassageType`: Today Scripture, passage/verse tools, public WEB reader, Create Image, chat citations | Exact retrieved verse text followed by its reference | Auto/Edge/Paradee online only, after Play |
| `devotional` | Today Reflection: reflection, both questions, and interpretation (as shown in the section) | Validated plan copy, guided or generated | Never; selected Paradee/Kokoro, or explicitly chosen local voice |
| `prayer` | Today Prayer: `day.prayer`, after plan validation | “A prayer inspired by today’s reading. This is not Scripture.” followed by the plan prayer | Never; selected Paradee/Kokoro, or explicitly chosen local voice |
| `action` | Today Practice: fixed `day.action` copy | Validated plan action, guided or generated | Never; selected Paradee/Kokoro, or explicitly chosen local voice |
| `interpretation` | Successful cited chat response’s `interpretation` block | Interpretation only, separate from answer/citations | Never; selected Paradee/Kokoro, or explicitly chosen local voice |

`ReadingPayload` is `{ kind, text, reference?, title? }`. `buildSpokenText` centralizes trimming and the prayer prefix while preserving the existing Scripture `readingText` behavior exactly. Titles are not spoken, and non-Scripture references are not added to speech. `engineForKind` is the client privacy gate: only `scripture` may reach Edge. Selecting Edge in Settings does not override the on-device rule for other content. The TTS API still accepts only text/reference and voice controls; this feature does not add devotional request kinds to it. The optional `stream` flag enables progressive MP3 delivery.

Compact controls provide Play/Pause, Stop, 0.8×–1.2× speed, an engine label, and a private-reading status. Scripture players keep their existing controls and labels. The separate Journey view shows only summaries, user intention, and day titles; its day content opens in Today, where these players are available.

**V1 excludes personal PrayerWriter content, journal entries, notes, typed Practice responses, arbitrary user text, drafts that failed Scripture gates, Settings narration, and whole-screen reading. There is no `user` reading kind and no Play on personal prayer or journal fields.** A generated plan prayer is distinct from the user-written PrayerWriter field. Players never mount for chat interpretation without a cited response.

## Engine choice

Settings → A voice for the Word → Reading voice engine:

- **Edge + Paradee 1.1 (default):** Edge for online Scripture; Paradee’s Heart voice for all other content, offline Scripture, and Edge failures. Today downloads and warms Paradee automatically when you are online. Legacy Auto is treated as Paradee.
- Auto: Scripture uses Edge online, then Kokoro offline/on failure. Other kinds always stay on-device.
- Edge: prefer Jenny online for Scripture only, with the same on-device fallback when unavailable. Other kinds always stay on-device.
- Kokoro: Bella on-device, even when online. It never calls the Edge route.
- Device voice: use an installed local English voice immediately, with no model download. Voice quality and availability depend on the device. This preference also applies to devotional content; it never uses Edge.

Edge sends only the Scripture text and reference after Play, through the Still server to Microsoft's online speech service. No speech text is sent on screen load or speed changes; Today may send a text-free HEAD request to warm the route. `/api/tts` accepts JSON `{text, reference?, voice?, rate?, stream?}`; voices are `en-US-JennyNeural` (default) and `en-US-AriaNeural`, and rate is a number from 0.8 to 1.2. It returns `audio/mpeg`, with `Cache-Control: no-store`, and writes no audio file. Request origin, text length, voice, and rate are checked. Provider failures return 503 for local fallback. The Node runtime is required; no API key is needed by the third-party `node-edge-tts` wrapper. This uses Edge's online service rather than a contracted Azure Speech endpoint; service availability may change independently of Still.

## Prepare offline reading

1. In Settings, choose **Download for offline** to save the PWA and WEB.
2. Under **Reading voice engine**, choose **Edge + Paradee 1.1 · Heart · recommended**.
3. Choose **Download on-device voice** and keep Settings open until it reports ready.

No API key, account, server inference, or GPU is needed for Paradee. Its pinned
int8 model is about **8.5 MB**, plus the shared ONNX runtime and bundled
phonemizer. Downloads contact Hugging Face for static model files only. The host
can see download metadata; reading text is never included. Existing Bella files
are retained so switching back does not require another model download.

Paradee 1.1 is distilled from Kokoro’s **af_heart**, not af_bella. It is a warm US
English female voice with a different timbre; Bella remains available via Auto,
Edge, or the explicit Kokoro option. Paradee runs WASM with one thread, or two
when cross-origin isolated with at least four logical cores. Bella uses WASM q8
(about 92 MB); its optional desktop WebGPU fp32 download is substantially larger.
Neither engine silently switches to a device or cloud voice on timeout.

Model bytes are stored as ArrayBuffers in IndexedDB for WebKit compatibility.
Settings caches the matching same-origin WASM/loader while loading the model in
parallel, then verifies synthesis with “Ready.” Before reporting offline readiness,
model persistence is checked. Browser eviction or clearing storage requires setup
again. Today does not download an unprepared model, including with autoplay on.

Today primes the actual next section while Scripture is visible, and looks one
section ahead during autoplay. It retains the worker and prepared audio throughout
the app session. Reloading requires loading/compiling saved assets again. Both
workers join all PCM parts into **one WAV per reading**, so there are no chunk
decoding gaps. Segments are at most 96 words / 600 characters on warmed Bella and
all Paradee readings. Inputs exceeding 510 phoneme tokens are split at word
boundaries and retried without truncation. All original text is retained in order.
No overlap/crossfade is applied by default. Generated audio stays in memory only.

Paradee requires eSpeak-to-Misaki conversion before tokenization; raw eSpeak
phonemes are incompatible with its training. The vendored upstream conversion,
Kokoro punctuation-preserving phonemizer and exact v1.1 vocabulary are attributed
under `lib/tts/vendor`. Model revision is pinned to
`330617ad1f097b4f6b02c103e54b39006c090b45`; v1.1 has only Heart and a specific
`input_ids` + `speed` → 24 kHz `waveform` contract. Do not silently upgrade it to a
later multi-voice model with different inputs.

The shared local client has separate 180-second download/model-load/first-inference
budgets and a 45-second warm-inference budget. Workers send a heartbeat every five
seconds, and queued jobs do not count as warm inference. Slow jobs automatically
extend up to three times before offering **Keep waiting** once. A timeout cancels
the current job without terminating the worker; it never chooses a system voice.
Genuine synthesis errors retry once before offering a choice. **Use device voice**
or the Device preference requires an installed English voice (`localService`).

Cancellation is cooperative: an in-flight ONNX call finishes in its serial queue,
but cancelled work cannot play, repopulate previews, or synthesize subsequent
chunks. Stop, section/translation/engine changes, navigation and PIN unmount stop
playback. Clearing preparation preserves compiled models; unrecoverable worker
errors or an explicit Bella backend change can reset them.

Safari may require a second Play tap after asynchronous preparation. Prepared
audio remains available with “Your audio is ready. Tap Play to listen.” Pause,
resume and speed changes reuse the same media element. Complete WAV playback does
not leave an inactive chunk scheduler intercepting pause/resume. Edge Scripture
uses buffered MP3, including Dock web apps. Translation loading gates Scripture
playback, and changing retrieved text cancels stale audio.

## Development and verification

`npm install`, then `npm run dev` or `npm run build`. Predev/prebuild copies and validates the matching ONNX runtime WASM/MJS files in generated, ignored `public/tts/`. `vercel.json` explicitly selects `npm run build` so dashboard commands that directly invoke `next build` cannot skip this preparation. The production smoke test checks `/tts/ort-wasm-simd-threaded.jsep.mjs` and the WASM magic bytes at `/tts/ort-wasm-simd-threaded.jsep.wasm`; the worker’s `wasmPaths` always uses its own origin. No model is included in the repository or production function bundle. Models download only on explicit Settings preparation (or Bella backend recovery); Today never starts an uncached download. WEB retrieval, citation validation, AWP actions, and model-provider choices remain separate from speech.

Unit tests cover exact Scripture input, routing/privacy, Misaki conversion,
phoneme limits, same-origin runtime selection, one-WAV output, cancellation,
lookahead reuse, and the shared watchdog lifecycle. Real-model browser checks are
opt-in to avoid downloads on every test run:

```bash
npm run typecheck
npm test
npm run build
TEST_REAL_PARADEE=1 STILL_WEBKIT=1 npm run test:e2e -- paradee.spec.ts
# Optional existing Bella check:
TEST_REAL_TTS=1 npm run test:e2e -- audio-runtime.spec.ts
```

The real Paradee test exercises Settings download, full Today reflection, exact
worker input, and prayer synthesis after an offline reload with real ONNX and
phonemization in Chromium and WebKit. Benchmark times depend on device/network;
upstream Python CPU results are not promises of browser startup time.

Sources and licensing: [Paradee 1.1 model](https://huggingface.co/sahilmahendrakar/Paradee-8M-v1.1),
[Paradee browser conversion](https://github.com/sahilmahendrakar/paradee/blob/main/web/misaki.js),
[Kokoro.js](https://github.com/hexgrad/kokoro/tree/main/kokoro.js),
[node-edge-tts](https://github.com/SchneeHertz/node-edge-tts).
Paradee/Kokoro are Apache-2.0; bundled source notices/licenses are retained.
The already-installed ONNX runtime and phonemizer are now pinned direct dependencies.
When upgrading ONNX, bump `still-tts-runtime-v1` in both the service worker and
preparation helper to avoid mixing cached loader/WASM versions.

### Local warm-up measurements

On the development Mac, production-build tests with real ONNX inference in
Chromium and WebKit measured initial Settings preparation around 1.8 seconds,
cold reflection playback around 2.4–2.6 seconds, and offline reload/prayer playback
around 2.4–3.6 seconds. Network cache conditions and hardware affect these times.
The automated prepared reflection-to-prayer handoff measured 9 ms / 36 ms from a
simulated media-ended event to the next playing state. This checks buffer/player
reuse and absence of another foreground synthesis; it is not an acoustic latency
measurement or a guarantee against OS/browser audio scheduling delays.
