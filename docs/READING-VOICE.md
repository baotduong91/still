# Optional reading aloud

## Bible reading position and compact player

The private Bible tab remembers its last visible verse and verse/chapter view
in the existing on-device state (`biblePosition`). The bookmark contains only a
reference, verse number and view preference. It saves during scrolling and before
navigation/page hiding, using the existing write-ahead record and IndexedDB. On
return or reload, the correct licensed page is selected and the verse is restored
after exact Scripture and fonts are ready. An explicit passage link takes priority
over a different saved passage. Translation remains the user's Settings preference;
offline WEB fallback does not overwrite it. Restoring never starts playback.

The Bible tab now has one compact player above the phone's navigation, centered
in the content column on desktop. It provides play/pause, previous/next reading
sections, progress, and an expandable speed/stop menu. Controls have 44px touch
targets; the phone bar is approximately 64px high and hides when the keyboard is
open. Verse notes no longer contain a second, expanded audio player.

Listening starts at the current verse. Sections contain at most eight retrieved
verse records and approximately 1,800 source characters, without truncating a
verse or splitting a grouped licensed span. Exact verse bytes and their true
reference are passed to the existing voice engine. “Continue through this passage”
advances within the currently retrieved passage/page; it stops at the end rather
than silently changing chapters. Previous/next buttons also move the reading
position into view. Scrolling while audio is playing does not interrupt it;
when idle, the player follows the visible verse. Navigation and PIN unmount stop
audio through the shared reading hook. Existing Edge/Paradee/device choices apply.

`bible-position.test.ts` covers bookmark validation, explicit links, page offsets
and exact source segmentation. `bible-reader.spec.ts` covers return/reload, CSB
page restoration, offline fallback, no autoplay on restore, exact Edge payloads,
automatic continuation, stop, and compact mobile/desktop proportions.

Still’s optional listen controls complement screen readers; they do not replace accessibility tools. `ReadingAudio` accepts a typed app-owned payload; `ScriptureAudio` remains a wrapper for existing passage views. One shared `useReadingAudio` hook owns playback, pause/resume, speed, cancellation, and the `still-reading-audio` event so only one reader can be active app-wide. Section, navigation, payload/engine changes, and PIN-boundary unmount stop playback.

## V1 content and privacy

| Kind | Source and placement | Spoken text | Edge eligibility |
| --- | --- | --- | --- |
| `scripture` | Retrieved `PassageType`: Today Scripture, passage/verse tools, public WEB reader, Create Image, chat citations | Exact retrieved verse text followed by its reference | Auto/Edge/Paradee online only, after Play |
| `devotional` | Today Reflection: reflection and questions (interpretation stays on screen only) | Validated plan copy, guided or generated | Never; selected Paradee, or explicitly chosen local voice |
| `prayer` | Today Prayer: `day.prayer`, after plan validation | Plan prayer text only | Never; selected Paradee, or explicitly chosen local voice |
| `action` | Today Practice: fixed `day.action` copy | Validated plan action, guided or generated | Never; selected Paradee, or explicitly chosen local voice |
| `interpretation` | Successful cited chat response’s `interpretation` block | Interpretation only, separate from answer/citations | Never; selected Paradee, or explicitly chosen local voice |

`ReadingPayload` is `{ kind, text, reference?, title? }`. `buildSpokenText` centralizes trimming while preserving the existing Scripture `readingText` behavior exactly. Titles are not spoken, and non-Scripture references are not added to speech. `engineForKind` is the client privacy gate: only `scripture` may reach Edge. Selecting Edge in Settings does not override the on-device rule for other content. The TTS API still accepts only text/reference and voice controls; this feature does not add devotional request kinds to it. The optional `stream` flag enables progressive MP3 delivery.

Compact controls provide Play/Pause, Stop, 0.8×–1.2× speed, an engine label, and a private-reading status. Scripture players keep their existing controls and labels. The separate Journey view shows only summaries, user intention, and day titles; its day content opens in Today, where these players are available.

**V1 excludes personal PrayerWriter content, journal entries, notes, typed Practice responses, arbitrary user text, drafts that failed Scripture gates, Settings narration, and whole-screen reading. There is no `user` reading kind and no Play on personal prayer or journal fields.** A generated plan prayer is distinct from the user-written PrayerWriter field. Players never mount for chat interpretation without a cited response.

## Engine choice

Settings → A voice for the Word → Reading voice engine:

- **Edge + Paradee 1.1 (default):** Edge for online Scripture; Paradee’s Heart voice for all other content, offline Scripture, and Edge failures. Today downloads and warms Paradee automatically when you are online. Saved Auto and Kokoro preferences migrate to Paradee; Device voice remains an explicit choice.
- Edge: prefer Jenny online for Scripture only, with the same on-device fallback when unavailable. Other kinds always stay on-device.
- Device voice: use an installed local English voice immediately, with no model download. Voice quality and availability depend on the device. This preference also applies to devotional content; it never uses Edge.

Edge sends only the Scripture text and reference after Play, through the Still server to Microsoft's online speech service. No speech text is sent on screen load or speed changes; Today may send a text-free HEAD request to warm the route. `/api/tts` accepts JSON `{text, reference?, voice?, rate?, stream?}`; voices are `en-US-JennyNeural` (default) and `en-US-AriaNeural`, and rate is a number from 0.8 to 1.2. It returns `audio/mpeg`, with `Cache-Control: no-store`, and writes no audio file. Request origin, text length, voice, and rate are checked. Provider failures return 503 for local fallback. The Node runtime is required; no API key is needed by the third-party `node-edge-tts` wrapper. This uses Edge's online service rather than a contracted Azure Speech endpoint; service availability may change independently of Still.

## Prepare offline reading

1. In Settings, choose **Download for offline** to save the PWA and WEB.
2. Under **Reading voice engine**, choose **Edge + Paradee 1.1 · Heart · recommended**.
3. Choose **Download on-device voice** and keep Settings open until it reports ready.

No API key, account, server inference, or GPU is needed for Paradee. Its pinned
int8 model is about **8.5 MB**, plus the shared ONNX runtime and bundled
phonemizer. Downloads contact Hugging Face for static model files only. The host
can see download metadata; reading text is never included. Paradee 1.1 uses the
warm US English Heart voice. No GPU is required. Isolated browsers with at least
four logical cores use two WASM threads; others use one.

Model bytes are stored as ArrayBuffers in IndexedDB for WebKit compatibility.
Settings caches the matching same-origin WASM/loader while loading the model in
parallel, then verifies synthesis with “Ready.” Before reporting offline readiness,
model persistence is checked. Browser eviction or clearing storage requires setup
again. Today automatically downloads and prepares the model when online, without starting playback. Offline visits use saved assets and never block reading.

Today primes the actual next section while Scripture is visible, and looks one
section ahead during autoplay. It retains the worker and prepared audio throughout
the app session. Reloading requires loading/compiling saved assets again. Both
workers join all PCM parts into **one WAV per reading**, so there are no chunk
decoding gaps. Segments are at most 96 words / 600 characters on Paradee readings. Inputs exceeding 510 phoneme tokens are split at word
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
errors  can reset them.

Safari may require a second Play tap after asynchronous preparation. Prepared
audio remains available with “Your audio is ready. Tap Play to listen.” Pause,
resume and speed changes reuse the same media element. Complete WAV playback does
not leave an inactive chunk scheduler intercepting pause/resume. Edge Scripture
uses buffered MP3, including Dock web apps. Translation loading gates Scripture
playback, and changing retrieved text cancels stale audio.

## Development and verification

`npm install`, then `npm run dev` or `npm run build`. Predev/prebuild copies and validates the matching ONNX runtime WASM/MJS files in generated, ignored `public/tts/`. `vercel.json` explicitly selects `npm run build` so dashboard commands that directly invoke `next build` cannot skip this preparation. The production smoke test checks `/tts/ort-wasm-simd-threaded.jsep.mjs` and the WASM magic bytes at `/tts/ort-wasm-simd-threaded.jsep.wasm`; the worker’s `wasmPaths` always uses its own origin. No model is included in the repository or production function bundle. Today downloads the model automatically while online. Settings also offers manual preparation. WEB retrieval, citation validation, AWP actions, and model-provider choices remain separate from speech.

Unit tests cover exact Scripture input, routing/privacy, Misaki conversion,
phoneme limits, same-origin runtime selection, one-WAV output, cancellation,
lookahead reuse, and the shared watchdog lifecycle. Real-model browser checks are
opt-in to avoid downloads on every test run:

```bash
npm run typecheck
npm test
npm run build
TEST_REAL_PARADEE=1 STILL_WEBKIT=1 npm run test:e2e -- paradee.spec.ts
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

### Shared Today overview and reading view

Today uses one continuous Scripture → Reflection → Prayer → Practice document and
one mountain scene. Listen starts the existing player and enters reading view;
Read hides navigation without starting speech. Returning to the overview keeps
the current section, playback, speed, and saved music level. Listening options
contains reading speed, music level, restart, and the privacy lock. Stop and
timeout recovery remain reachable from the player.

The overview player sits above mobile navigation; reading view uses the same
player above the safe-area inset. Pausing narration pauses the music instead of
letting the autoplay checkbox keep it running. Browsing sections before Play
does not start narration. Settings preparation also repairs missing runtime
assets when the model itself is already cached.

Availability checks for hosted models and translations pause while offline and
refresh on reconnect. Browser tests exercise that behavior without suppressing
offline runtime errors. Safari/WebKit currently uses the guarded single-thread
WASM path with the app's credentialless isolation headers; real offline synthesis
is verified separately from shared-memory capability.

When Today's background music is enabled, the same loop continues through narration
handoffs and after the final Practice reading finishes. Pause, Stop, turning music
off, or leaving Today ends playback; finishing narration alone does not. Music
returns to its unducked level when voice reading ends.
