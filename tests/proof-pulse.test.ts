import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { verifyHpr1AssertionToken } from "../src/proof-pulse-contract.ts";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const exported = publicKey.export({ format: "jwk" });
const jwks = {
  keys: [{ ...exported, kid: "hpr1-test", use: "sig", alg: "EdDSA" }],
};
const expected = {
  issuer: "https://heartbadge.example",
  requestId: "request-opaque-001",
  nonce: "nonce-opaque-001",
  contextHash: "b".repeat(64),
  nowSeconds: 1_800_000_000,
};
const baseClaims = {
  iss: expected.issuer,
  aud: "hallucinate",
  jti: "assertion-opaque-identifier",
  iat: expected.nowSeconds,
  exp: expected.nowSeconds + 90,
  request_id: expected.requestId,
  nonce: expected.nonce,
  context_hash: expected.contextHash,
  predicate: "PROGRAM_ELIGIBILITY",
  policy: "hallucinate_party_entry",
  eligible: true,
};

function signedToken(claims: Record<string, unknown>, key = privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: "hpr1-test" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const input = header + "." + payload;
  return input + "." + sign(null, Buffer.from(input), key).toString("base64url");
}

test("accepts a valid, minimal, request-bound HeartBadge assertion", () => {
  assert.deepEqual(
    verifyHpr1AssertionToken(signedToken(baseClaims), jwks, expected),
    { jti: baseClaims.jti, exp: baseClaims.exp },
  );
});

test("rejects altered signatures and mismatched issuer, audience, request, nonce, or context", () => {
  const valid = signedToken(baseClaims);
  const parts = valid.split(".");
  const tampered = parts[0] + "." + parts[1] + "." + Buffer.alloc(64).toString("base64url");
  assert.equal(verifyHpr1AssertionToken(tampered, jwks, expected), null);
  for (const field of ["iss", "aud", "request_id", "nonce", "context_hash"] as const) {
    const altered = { ...baseClaims, [field]: "wrong-value" };
    assert.equal(verifyHpr1AssertionToken(signedToken(altered), jwks, expected), null);
  }
});

test("rejects expired assertions and assertions that disclose a stable identity", () => {
  assert.equal(verifyHpr1AssertionToken(
    signedToken({ ...baseClaims, exp: expected.nowSeconds - 1 }),
    jwks,
    expected,
  ), null);
  assert.equal(verifyHpr1AssertionToken(
    signedToken({ ...baseClaims, sub: "stable-member-id" }),
    jwks,
    expected,
  ), null);
  assert.equal(verifyHpr1AssertionToken(
    signedToken({ ...baseClaims, email: "member@example.test" }),
    jwks,
    expected,
  ), null);
});

test("rejects a signing key not published in the approved JWKS", () => {
  const other = generateKeyPairSync("ed25519");
  assert.equal(verifyHpr1AssertionToken(signedToken(baseClaims, other.privateKey), jwks, expected), null);
});
