/** Default on-device loop (32s, cross-faded). Replace with CC0 assets per `public/audio/ambient/README.md`. */
export const defaultAmbientLoop = "/audio/ambient/stillness-v3.mp3";

export const ambientAttribution = {
  bundled: "Still generated stillness bed (replaceable)",
  recommended: {
    title: "Raga of Stillness Drone",
    source: "Lots of Sounds",
    license: "CC0 1.0",
    url: "https://www.lotsofsounds.com/sounds/raga-of-stillness-drone-fs-856221",
    note: "5-minute meditation drone; no attribution required.",
  },
  alternatives: [
    {
      title: "Evolving Ambient Drone",
      license: "CC0",
      url: "https://www.lotsofsounds.com/sounds/evolving-ambient-drone-fs-867409",
    },
    {
      title: "Loops of Ambience (90 WAV loops)",
      license: "CC0",
      url: "https://signaturesounds.org/store/p/ambient-loops-free-download-cc0-wav-sample-pack-",
    },
  ],
} as const;
