import { Hash, Mode, Srp, util } from "@foxt/js-srp";

// Apple's SRP (GSA) sign-in, in the browser. This is the only file that sees
// your password. Only the SRP values (A, then M1 and M2) go to the ShipThis API.
// Same maths as @expo/apple-utils (createAppleSrpClientAsync).
// scripts/make-vector.mjs is a separate copy that the tests check this against.

export type SrpProtocol = "s2k" | "s2k_fo";

export const SRP_PROTOCOLS: SrpProtocol[] = ["s2k", "s2k_fo"];

export interface SrpChallenge {
  salt: string; // base64
  iterations: number;
  protocol: SrpProtocol;
  b: string; // base64
}

export interface SrpProof {
  m1: string; // base64
  m2: string; // base64
}

export interface AppleSrpClient {
  accountName: string;
  protocols: SrpProtocol[];
  a: string; // base64
  proof: (password: string, challenge: SrpChallenge) => Promise<SrpProof>;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const normalizeAccountName = (accountName: string) =>
  accountName.toLowerCase().trim();

async function derivePassword(
  srp: Srp,
  password: string,
  { protocol, salt, iterations }: SrpChallenge
): Promise<Uint8Array> {
  let p = new Uint8Array(await util.hash(srp.h, toArrayBuffer(utf8(password))));
  if (protocol === "s2k_fo") p = utf8(util.toHex(p));
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey(
    "raw",
    toArrayBuffer(p),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(fromBase64(salt)),
      iterations,
    },
    key,
    256
  );
  return new Uint8Array(bits);
}

// `a` is only for a fixed test vector. Leave it out in the app.
export async function init(
  accountName: string,
  a?: bigint
): Promise<AppleSrpClient> {
  const name = normalizeAccountName(accountName);
  const srp = new Srp(Mode.GSA, Hash.SHA256, 2048);
  const client = await srp.newClient(utf8(name), new Uint8Array(), a);

  return {
    accountName: name,
    protocols: SRP_PROTOCOLS,
    a: toBase64(util.bytesFromBigint(client.A)),
    proof: async (password, challenge) => {
      client.p = await derivePassword(srp, password, challenge);
      const m1Hex = await client.generate(
        fromBase64(challenge.salt),
        fromBase64(challenge.b)
      );
      const m2 = await client.generateM2();
      return { m1: toBase64(util.fromHex(m1Hex)), m2: toBase64(m2) };
    },
  };
}
