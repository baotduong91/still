import { mkdir, copyFile, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const runtime = path.dirname(require.resolve("onnxruntime-web"));
const target = path.resolve("public/tts");
await mkdir(target, { recursive: true });
for (const name of await readdir(runtime)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(name))
    await copyFile(path.join(runtime, name), path.join(target, name));
}
// Fail the build instead of shipping a reader whose runtime returns 404.
for (const name of [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
]) {
  if ((await stat(path.join(target, name))).size === 0)
    throw new Error(`Missing ONNX runtime: ${name}`);
}
console.log("Prepared same-origin Bella WASM runtime in public/tts.");
