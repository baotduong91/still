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

Today renders Verse → Reflection → Prayer → Practice as one vertical page, with a mountain-backed verse card and a single minimal fixed player above mobile navigation. Section links and Continue controls scroll within the page and respect reduced motion. Passive viewport tracking selects the current section; changing sections cancels the previous reading. Natural completion scrolls toward the next section; with Autoplay next section enabled (the default), it then starts that section’s reading. Personal prayer and typed Practice fields stay mounted while scrolling; only the plan's fixed day copy can be narrated. PIN locking and navigation still unmount/cancel the reader.

Shortly after Today’s first paint, a deferred task warms already downloaded Bella assets. It never initiates a model download on page load. The first segment of each app-owned reflection, plan prayer, and fixed action is prepared on-device and held in a bounded in-memory cache. Play can consume that segment synchronously, while the worker generates the remaining segments. Nothing is spoken during preparation. This memory cache is cleared when Today exits. Cold devices still need an explicit download/first-use setup; an installed local voice remains available immediately.

For online Scripture, Today sends a text-free HEAD request to warm the Next.js runtime. Only Play sends the exact displayed text/reference in a POST. With `stream:true`, the server returns MP3 bytes as soon as the first audio chunk arrives. Browsers supporting MediaSource `audio/mpeg` append those bytes progressively; other browsers retain buffered MP3 playback. Successfully played Scripture audio is cached only in the reader’s memory for immediate replay and is cleared on unmount. No new persistent personal audio cache is introduced. Network and cold-start latency cannot be eliminated, so the player keeps its quiet loading state and explicit device-voice fallback.

Tests cover four simultaneously mounted sections, typed response retention across scrolling, active-section engine selection, natural-completion scrolling with Autoplay next section (on by default), Today Bella warm plus prime before Play, autoplay reusing preloaded Kokoro audio while preparing only the next section, whole-section Web Audio buffering for gapless Bella playback, private text staying off Edge, first-byte MP3 delivery, and reuse of complete prepared Bella readings. The opt-in real-runtime checks also measure warm Today latency and decode an actual Edge MP3 with browser output muted.

Production diagnosis (November 11, 2026): deployment `56acd22` served both runtime URLs as 404. Its Vercel build log directly ran Prisma and `next build`, bypassing `npm run prebuild`. The committed build configuration fixes that omission for the next deployment; production needs this commit deployed before those URLs change. After deploying, check both runtime URLs return 200 (or 206 for a range request), not an HTML 404.

### Continuous Today listening

Today’s player has an **Autoplay next section** checkbox (on by default).
After a reading finishes, Today scrolls to the next section; when checked it
starts that section after the scroll. The sequence ends at Practice and never
completes the day or submits a personal response. Turning autoplay off prevents
further automatic readings. Manual scrolling selects a section without starting
it. Browser audio restrictions may still require tapping Play.

Bella now prepares **complete sections**, not just their opening words, while
Today is open and the model is already downloaded. Up to four prepared readings
stay in memory and are cleared when the flow changes or unmounts; personal audio
is not uploaded or persisted. Foreground playback reuses that complete audio.
Uncached Bella readings buffer every segment before starting, so slow WASM
inference does not interrupt the voice every few words. The loading UI and Stop
remain available. This trades initial preparation time for uninterrupted reading;
it does not make slow-device inference instant. Download Bella in Settings first
and allow Today to prepare while reading the verse for the fastest start.

Scripture still uses Edge online according to the selected engine. Reflection,
prayer and practice stay on-device. No automatic device-voice substitution was
added, and the exact retrieved Scripture text is unchanged.

### Next-section lookahead

Today prepares the reflection as soon as it opens with an already downloaded
Bella model. With autoplay enabled, starting each subsequent reading prepares
its immediate successor. This gives synthesis the whole current reading as a
head start rather than waiting for the last few words. Later sections are not
queued ahead of that successor. Identical preparation requests share one task;
a compiled worker skips redundant warm-up jobs.

Prepared audio is loaded into an HTML audio player before the handoff. Playback
reuses that player and skips model-cache checks; scrolling and the next reading
start together, without the previous fixed 750 ms delay. Preloaded media is
released on day changes, navigation, engine changes, and PIN unmount. Preparation is local only and sends no personal text to Edge. Uncached
assets may download after Play with autoplay enabled, as described below. A cold model or synthesis slower than the current reading
can still require waiting; this is near-continuous playback when ready, not a
sample-accurate gapless guarantee across browser audio engines.

### First-use download overlap

With autoplay enabled, tapping Play on Today starts preparing the next Bella
section while Scripture plays. This also works before a Settings download:
only model/voice assets are fetched; devotional text stays in the worker.
Simply opening Today still does not download an uncached model. Offline and
Device voice choices do not trigger an automatic download.

Preparation now compiles using the actual next reflection instead of an extra
throwaway “Ready.” inference. Cold lookahead uses the larger sentence-sized
batches because it buffers the whole section, avoiding tiny startup inferences. Settings preparation still uses “Ready.” to verify
the standalone download. Bella’s voice asset is prefetched in parallel with the
q8 model/tokenizer and reused through kokoro-js’s voice cache. A failed prefetch
is not cached, and normal voice loading remains available. The existing q8 model
and af_bella voice are unchanged; no quality tradeoff or extra model is introduced.

The initial model transfer is still roughly 90 MB plus runtime/voice assets.
On a slow connection or device, it may exceed the length of Scripture. The UI
shows preparation, and full-section buffering prevents interruptions once Bella
starts; truly gapless first-ever playback cannot be guaranteed before download
and synthesis finish. Previously downloaded assets and prepared audio are reused.

### Settings-first setup and desktop acceleration

Download Bella in Settings → Reading voice before private listening. Today never
starts an uncached model download, including when autoplay is enabled. It links
to Settings instead. Downloaded models/voice files are retained in IndexedDB and
Cache Storage; preparation also precaches the matching same-origin ONNX loader
and WASM runtime using `/tts/manifest.json`. The service worker reuses that cache.
No personal audio or text is added to the public runtime cache.

The default remains WASM q8 (roughly 90 MB). The Settings checkbox **Prefer desktop
WebGPU** opts into the larger fp32 model, after an adapter check on desktop.
Unsupported adapters and GPU load/inference errors fall back to WASM q8 with Bella.
That fallback can require an additional download if only fp32 is cached; offline
users can choose their installed device voice explicitly. Mobile uses WASM.
Backend changes explicitly reset the worker; normal Stop, pause and section
changes retain it. GPU preparation and speed depend on the browser/device; no
fixed startup time is promised.

COOP same-origin plus COEP credentialless enable cross-origin isolation where
supported. Isolated devices with at least four logical cores use two WASM threads;
others keep one. CORS API calls remain normal; credentialless avoids cookies on
cross-origin no-CORS resources (including opted-in Scripture usage reporting).
Today warms downloaded Bella on entry, then primes the immediate next section’s
real text. Autoplay preloads the following section during playback. Returning
within the same app session reuses the worker.
A browser reload/OS eviction still requires loading and compiling cached assets;
compiled ONNX sessions do not persist across browser restarts.

This supersedes the earlier first-Play download behavior and WASM-only policy.

Verification for this change: 173 unit tests, production build/typecheck, and 20
browser checks passed (19 audio/runtime scenarios plus the explicit runtime-cache
and offline isolated Today reload). The two opt-in real-model/live-Edge checks
were skipped; WebGPU performance has not been measured on physical hardware.
When upgrading ONNX Runtime, bump `still-tts-runtime-v1` in both the service worker
and runtime preparation helper so cached loader/WASM files stay matched.

### One-file Bella playback

Warmed and lookahead readings use up to 96 words / 600 characters per segment;
short daily reflections commonly fit in one segment. Kokoro tokenization runs
without silent truncation: input over the guarded 510-token budget is split
again at word boundaries before inference. All original text remains in order.
Cold readings keep smaller inference segments, but every foreground or prime
job joins PCM in the worker and transfers exactly one WAV for playback. This
avoids per-part decoding/scheduling and reuses complete readings in memory.

`joinAudio(parts, crossfadeMs)` optionally overlaps up to 10 ms at each seam.
The worker accepts `crossfadeMs` for explicit callers. Default is 0 (lossless
concatenation); enabling overlap may affect adjacent phonemes and is not applied
automatically to Scripture. Cancellation discards incomplete audio. Existing
heartbeat/budget handling and GPU/WASM recovery remain active.
