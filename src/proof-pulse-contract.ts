import { createPublicKey, verify as verifySignature } from "node:crypto";

export type ExpectedHpr1Claims = {
  issuer: string;
  requestId: string;
  nonce: string;
  contextHash: string;
  audience?: string;
  nowSeconds?: number;
};

export type Hpr1Jwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

const CLAIM_KEYS = new Set([
  "iss", "aud", "jti", "iat", "exp", "request_id", "nonce",
  "context_hash", "predicate", "policy", "eligible",
]);

export function verifyHpr1AssertionToken(
  token: string,
  jwks: { keys?: Hpr1Jwk[] },
  expected: ExpectedHpr1Claims,
): { jti: string; exp: number } | null {
  const pieces = token.split(".");
  if (pieces.length !== 3 || pieces.some((piece) => !piece)) return null;
  try {
    const header = JSON.parse(Buffer.from(pieces[0]!, "base64url").toString("utf8")) as { alg?: string; kid?: string; typ?: string };
    const claims = JSON.parse(Buffer.from(pieces[1]!, "base64url").toString("utf8")) as Record<string, unknown>;
    if (header.alg !== "EdDSA" || header.typ !== "JWT" || !header.kid) return null;
    const jwk = jwks.keys?.find((key) =>
      key.kid === header.kid && key.kty === "OKP" && key.crv === "Ed25519"
      && key.use === "sig" && key.alg === "EdDSA" && typeof key.x === "string"
    );
    if (!jwk) return null;
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    const signingInput = Buffer.from(pieces[0] + "." + pieces[1]);
    if (!verifySignature(null, signingInput, publicKey, Buffer.from(pieces[2]!, "base64url"))) return null;
    const now = expected.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (Object.keys(claims).some((key) => !CLAIM_KEYS.has(key))) return null;
    if (claims.iss !== expected.issuer || claims.aud !== (expected.audience ?? "hallucinate")
      || claims.request_id !== expected.requestId || claims.nonce !== expected.nonce
      || claims.context_hash !== expected.contextHash || claims.predicate !== "PROGRAM_ELIGIBILITY"
      || claims.policy !== "hallucinate_party_entry" || claims.eligible !== true
      || typeof claims.exp !== "number" || claims.exp <= now || claims.exp > now + 180
      || typeof claims.iat !== "number" || claims.iat > now + 30 || claims.iat < now - 180
      || typeof claims.jti !== "string" || claims.jti.length < 16 || claims.jti.length > 128) return null;
    return { jti: claims.jti, exp: claims.exp };
  } catch {
    return null;
  }
}
