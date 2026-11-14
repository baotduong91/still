// This pinned ORT release omits types from its subpath export map.
// The WebGPU entry includes the JSEP WASM runtime used by both local voices.
declare module "onnxruntime-web/webgpu" {
  export * from "onnxruntime-common";
}
