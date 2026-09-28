import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { createMultiplayer } from "../src/multiplayer.ts";
import { checkPartyProofSession } from "../src/proof-pulse-auth.ts";
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

test("distinguishes session service outages from a valid unauthenticated session", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    assert.deepEqual(await checkPartyProofSession(), { authenticated: false, unavailable: true });

    globalThis.fetch = async () => { throw new Error("network unavailable"); };
    assert.deepEqual(await checkPartyProofSession(), { authenticated: false, unavailable: true });

    globalThis.fetch = async () => new Response(
      JSON.stringify({ enabled: true, authenticated: false }),
      { headers: { "content-type": "application/json" } },
    );
    assert.deepEqual(await checkPartyProofSession(), { enabled: true, authenticated: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not create realtime connections before the party session is authorized", async () => {
  const originalFetch = globalThis.fetch;
  let tokenRequests = 0;
  try {
    globalThis.fetch = async () => {
      tokenRequests++;
      return new Response("unauthorized", { status: 401 });
    };
    const noOp = () => {};
    const multiplayer = createMultiplayer({
      canConnect: () => false,
      localPosition: [0, 0, 0],
      localTurn: () => 0,
      localMoveAngle: () => 0,
      localInput: [0, 0, 0],
      localMode: () => "stand",
      localIdleClipIndex: () => 0,
      localSunglasses: () => false,
      localActions: () => 0,
      localActionTurn: () => 0,
      localInstagram: () => "",
      localNickname: () => "",
      localEntered: () => false,
      localProfileReady: () => false,
      localStyle: () => ({
        topStyleIndex: 0,
        bottomStyleIndex: 0,
        hairIndex: 0,
        hairColorIndex: 0,
        skinColorIndex: 0,
        accessoryIndex: 0,
      }),
      initialRoom: 0,
      onRoomState: noOp,
      onMessage: noOp,
      onProfile: noOp,
      onDeleteMessages: noOp,
      onLeave: noOp,
      onOnlineCount: noOp,
      onVideoPlaylistRequest: noOp,
      onVideoSync: noOp,
      onBeachBalls: noOp,
      onDuckPosition: noOp,
      onGraffiti: noOp,
    });
    await multiplayer.connect();
    assert.equal(tokenRequests, 0);
    multiplayer.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
