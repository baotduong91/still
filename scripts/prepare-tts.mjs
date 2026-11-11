import { mkdir, copyFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const runtime = path.dirname(require.resolve("onnxruntime-web"));
const target = path.resolve("public/tts");
await mkdir(target, { recursive: true });
for (const name of await readdir(runtime)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(name)) await copyFile(path.join(runtime,name),path.join(target,name));
}
