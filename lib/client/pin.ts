export type PinRecord = { salt: string; hash: string; iterations: number };
const hex = (data: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(data instanceof Uint8Array ? data.buffer : data))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
async function derive(pin: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: salt as Uint8Array<ArrayBuffer>,
        iterations,
      },
      key,
      256,
    ),
  );
}
export async function createPin(pin: string): Promise<PinRecord> {
  if (!/^\d{6,12}$/.test(pin))
    throw new Error("Choose a PIN with 6 to 12 digits.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 210000;
  return {
    salt: hex(salt),
    hash: await derive(pin, salt, iterations),
    iterations,
  };
}
export async function verifyPin(pin: string, record: PinRecord) {
  if (
    !/^\d{6,12}$/.test(pin) ||
    !/^([0-9a-f]{2}){16}$/.test(record.salt) ||
    record.iterations < 210000 ||
    record.iterations > 1000000
  )
    return false;
  const salt = Uint8Array.from(record.salt.match(/../g)!, (x) =>
    parseInt(x, 16),
  );
  const hash = await derive(pin, salt, record.iterations);
  return (
    hash.length === record.hash.length &&
    [...hash].reduce(
      (sum, ch, i) => sum | (ch.charCodeAt(0) ^ record.hash.charCodeAt(i)),
      0,
    ) === 0
  );
}
