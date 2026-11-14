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
