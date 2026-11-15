# Today ambient loop

Still ships a short **32-second** cross-faded sine bed (`stillness-loop.mp3`) so offline Today always has a seamless loop with zero licensing friction.

For a richer BibleChat-style atmosphere, replace `stillness-loop.mp3` with any **CC0** (public domain) ambient loop. Recommended picks:

| Track | Why | License |
| --- | --- | --- |
| [**Raga of Stillness Drone**](https://www.lotsofsounds.com/sounds/raga-of-stillness-drone-fs-856221) (Lots of Sounds) | Meditation-focused, slow evolving, ~5 min | **CC0** · commercial use · no attribution |
| [**Evolving Ambient Drone**](https://www.lotsofsounds.com/sounds/evolving-ambient-drone-fs-867409) | Dark cinematic bed, loop-friendly | **CC0** |
| [**Loops of Ambience**](https://signaturesounds.org/store/p/ambient-loops-free-download-cc0-wav-sample-pack-) (Signature Sounds) | 90 seamless WAV loops | **CC0** |

After download, convert to a **looping MP3** (~96–128 kbps) and overwrite `stillness-loop.mp3`, or change `defaultAmbientLoop` in `lib/audio/ambient.ts`.

Avoid Pixabay/Artlist “free” tiers that forbid redistribution in apps unless you confirm license terms.
## Playback

Today decodes this file once into a Web Audio buffer and applies a short circular
PCM crossfade to smooth the encoded file boundary. One looping source stays alive
through narration and autoplay handoffs; it does not fetch/decode or restart at
each seam. Gain ramps lower the bed under narration. Pause resumes at the saved
music offset. Turning music off or leaving Today cancels pending loads as well as
active playback, so a late download cannot start sound after navigation or lock.
Music loading never delays the voice Play action. Saved music preferences alone
do not start audio on page load; playback begins with the player gesture.

## Audibility correction (v2)

The original file measured -45.1 dBFS RMS before playback gain; it could run while
being effectively inaudible. `stillness-v2.mp3` is the same original generated bed
normalized to approximately -18.5 dBFS RMS / -10.4 dBFS peak, without clipping.
Voice ducking is 0.25 and music-only gain is 0.4. The new URL and service-worker
cache revision avoid reusing the nearly silent asset. Browser regressions now
check decoded PCM RMS as well as loop/start/stop behavior. No third-party music
was downloaded. The music button starts listening immediately, independently of
whether narration has started, and failures produce a quiet retry message.

## Phone-speaker mix (v3)

The earlier bed concentrated energy below 250 Hz. Version 3 is an original,
periodic 32-second stereo pad with harmonics from 220–659 Hz, designed to remain
audible on phone speakers. It is generated locally with no third-party assets.
Default gain is 0.4 beneath narration and 0.6 for music alone, with 150 ms ramps.
Listening options exposes a saved Music level slider. Tests measure the output
of the gain node while a real HTML narration element is playing, rather than
checking only that a source started. The v3 URL and SW v18 invalidate older audio.
