import type { PassageType } from "@/lib/schemas";
export const formats = {
  story: { label: "Story", ratio: "9:16", width: 1080, height: 1920 },
  square: { label: "Square", ratio: "1:1", width: 1080, height: 1080 },
  portrait: { label: "Portrait", ratio: "4:5", width: 1080, height: 1350 },
  wallpaper: { label: "Wallpaper", ratio: "9:19.5", width: 1440, height: 3120 },
} as const;
export type Format = keyof typeof formats;
export const styles = {
  classic: {
    label: "Classic",
    description: "Quiet serif · soft shade",
    ink: "#fffdf6",
    tint: "rgba(18,37,29,.57)",
    font: "Georgia, serif",
    align: "center",
    italic: false,
  },
  editorial: {
    label: "Editorial",
    description: "Ivory paper · generous serif",
    ink: "#293c31",
    tint: "rgba(248,246,237,.93)",
    font: "Georgia, serif",
    align: "left",
    italic: false,
  },
  ink: {
    label: "Ink",
    description: "Deep charcoal · crisp type",
    ink: "#f8f5e9",
    tint: "rgba(13,22,26,.88)",
    font: "Arial, sans-serif",
    align: "left",
    italic: false,
  },
  dawn: {
    label: "Dawn",
    description: "Warm light · lyrical italic",
    ink: "#49382f",
    tint: "rgba(252,228,204,.88)",
    font: "Georgia, serif",
    align: "center",
    italic: true,
  },
  stillwater: {
    label: "Stillwater",
    description: "Soft sage · simple words",
    ink: "#203b32",
    tint: "rgba(219,232,216,.91)",
    font: "Arial, sans-serif",
    align: "center",
    italic: false,
  },
} as const;
export type Style = keyof typeof styles;
export const backgrounds = {
  mountains: { label: "Mountain hush", url: "/backgrounds/mountain-hush.jpg" },
  lake: { label: "Quiet water", url: "/backgrounds/quiet-water.svg" },
  hills: { label: "Sage hills", url: "/backgrounds/sage-hills.svg" },
} as const;
export type Background = keyof typeof backgrounds;
// Wrapping preserves words and punctuation; Scripture is never abbreviated.
export function wrapText(
  text: string,
  measure: (s: string) => number,
  width: number,
) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
export function renderVerseImage(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  passage: PassageType,
  format: Format,
  style: Style,
) {
  if (passage.verses.length !== 1 || !passage.verses[0].text.trim())
    throw new Error("Choose one retrieved verse for your image.");
  const { width: w, height: h } = formats[format];
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Image creation is unavailable in this browser.");
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  c.drawImage(
    image,
    (w - image.naturalWidth * scale) / 2,
    (h - image.naturalHeight * scale) / 2,
    image.naturalWidth * scale,
    image.naturalHeight * scale,
  );
  const s = styles[style];
  c.fillStyle = s.tint;
  c.fillRect(0, 0, w, h);
  const margin = w * 0.105,
    usable = w - margin * 2;
  c.fillStyle = s.ink;
  c.textBaseline = "top";
  c.textAlign = s.align;
  const x = s.align === "left" ? margin : w / 2;
  c.font = `${w * 0.021}px Arial, sans-serif`;
  c.fillText("S T I L L   /   A MOMENT IN THE WORD", x, h * 0.12);
  const v = passage.verses[0];
  const ref = `${v.book} ${v.chapter}:${v.verse} · ${passage.translation}`;
  const credit = passage.attribution || "World English Bible · Public domain";
  c.font = `${w * 0.019}px Arial, sans-serif`;
  const creditLines = wrapText(credit, (t) => c.measureText(t).width, usable);
  const creditHeight = creditLines.length * w * 0.027;
  if (creditHeight > h * 0.16)
    throw new Error(
      "This edition’s attribution is too long for an image. Choose WEB.",
    );
  const contentTop = format === "wallpaper" ? h * 0.32 : h * 0.27;
  const available = h * 0.8 - creditHeight - contentTop - w * 0.1;
  let font = Math.min(w * 0.066, h * 0.058),
    lines: string[] = [];
  for (; font >= w * 0.022; font -= 1) {
    c.font = `${s.italic ? "italic " : ""}${font}px ${s.font}`;
    lines = wrapText(v.text, (t) => c.measureText(t).width, usable);
    if (
      lines.length * font * 1.42 <= available &&
      lines.every((line) => c.measureText(line).width <= usable)
    )
      break;
  }
  if (font < w * 0.022)
    throw new Error(
      "This verse is too long to fit clearly. Try Story or Wallpaper.",
    );
  const top =
    contentTop + Math.max(0, (available - lines.length * font * 1.42) / 2);
  lines.forEach((line, i) => c.fillText(line, x, top + i * font * 1.42));
  c.font = `${w * 0.025}px Arial, sans-serif`;
  c.fillText(ref, x, top + lines.length * font * 1.42 + w * 0.045);
  c.font = `${w * 0.019}px Arial, sans-serif`;
  creditLines.forEach((line, i) =>
    c.fillText(line, x, h * 0.86 - creditHeight + i * w * 0.027),
  );
  c.globalAlpha = 0.4;
  c.fillRect(margin, h * 0.9, usable, 1);
  c.globalAlpha = 1;
  c.font = `${w * 0.018}px Arial, sans-serif`;
  c.fillText("A LITTLE CLOSER, EVERY DAY", x, h * 0.925);
}
export function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not create your image. Please try again.")),
      "image/png",
    ),
  );
}
export function saveImage(file: File) {
  const url = URL.createObjectURL(file),
    a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
