# Create Image

Open **Create Image** below a passage on Today, search results, or cited chat. In the Scripture reader, select a verse number and choose Create Image. The `/create-image?ref=John%203%3A16&translation=WEB` route also opens directly. If a passage contains multiple verses, Scripture options lets you pick one; each image has one complete verse and its canonical reference.

Pick Story (1080×1920), Square (1080×1080), Portrait (1080×1350), or Wallpaper (1440×3120). Classic, Editorial, Ink, Dawn, and Stillwater change type, color, alignment, and overlay. Choose Mountain hush, Quiet water, or Sage hills for a different backdrop. The same high-resolution canvas supplies the preview and PNG, with fitting that reduces font size and refuses an image rather than truncating Scripture or attribution.

Save to device downloads a PNG. Browser download locations vary; on iPhone, open the downloaded image and use Save Image to put it in Photos. Share uses the native Web Share file API where supported. PNG files are prepared before the tap to preserve browser user activation. Cancellation is quiet; unsupported sharing downloads the image with instructions for sharing from Photos/Downloads. The app cannot force Instagram or another particular destination to appear in the system sheet.

WEB is retrieved from the bundled local corpus. CSB/NLT use the existing online Scripture opt-in and API.Bible provider when configured. Unavailable editions show an explicit WEB fallback and every preview, filename, and export is labeled with the actual retrieved translation. Provider attribution is rendered in the exported image. Existing translation quotation limits and publisher conditions still apply; this does not authorize full-corpus embedding or bulk export. No new API, model call, image upload, localStorage record, or saved personal data is introduced. Existing API.Bible usage reporting applies to online edition retrieval.

Download for offline in Settings now saves the Create Image shell, its code, and all three backgrounds, alongside WEB. The service worker never caches online Scripture API responses. After that download, WEB export works offline across all formats and styles. The route inherits the existing PIN boundary; PIN and model settings are unchanged.

## Background assets

`public/backgrounds/mountain-hush.jpg` is an original background made with the built-in image-generation tool, then converted to JPEG for bundling. Prompt: “Create a single photorealistic fine art nature photograph as a bundled background for a calm Bible verse sharing app. Portrait 9:16 framing, misty layered sage green mountain ridges and a still lake in the bottom third, soft ivory overcast sky covering upper half, faint warm dawn light, subtle analog film grain, muted sage, pale stone, gentle charcoal, serene premium editorial travel photography. Very low detail and clean negative space through the center for text to be overlaid by code. No text, no letters, no branding, no people, no buildings. Natural realistic landscape, not an illustration.”

`quiet-water.svg` and `sage-hills.svg` are original code-native landscape illustrations. All backgrounds are bundled and require no remote image hosts or credentials. Generated artwork contains no Scripture; Scripture is always drawn afterward from retrieval.

## Validation

Unit checks cover wrapping fidelity and aspect ratios. Browser checks cover Today and verse entry, all four pixel dimensions, five styles, three backgrounds, PNG download and native-share payload, mobile overflow, and offline WEB fallback/export. Browser sharing is mocked for automation; confirm the real system share sheet on an iPhone/Android device before release.
