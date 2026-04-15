# Hardening Considerations

Known areas where the protocol or library could be further strengthened.
These are not bugs — they are design-level trade-offs that should be
revisited as the project matures.

---

## Password authentication sends plaintext credentials to Spire

`login()` and `register()` send the user's password in the request body
(msgpack over TLS). The server sees the raw password.

**Risk:** A compromised Spire instance or TLS interception exposes
credentials. Users who reuse passwords across services are especially
vulnerable.

**Mitigations to explore:**

- **OPAQUE / SRP (PAKE):** The server never learns the password. This is
  the gold standard but requires server-side protocol changes in Spire.
- **Client-side key derivation before sending:** e.g.
  `PBKDF2(password, username)` so the server never sees the raw password.
  The server still receives a replayable credential, but password reuse
  across services is no longer exploitable.
- **Device-key-only authentication:** New accounts could skip passwords
  entirely and authenticate via signed challenges
  (`loginWithDeviceKey` already exists). Password login could be
  deprecated over time.
- **WebAuthn / passkeys:** Platform-native passwordless auth. Requires
  server support and doesn't work in all environments (CLI bots, etc.).

---

## Key bundle exhaustion and trust

Any authenticated user can request key bundles for any device. There is
no rate limiting, approval, or proof-of-intent in the current protocol.

**Risk:** A malicious user (or compromised account) can drain all
one-time prekeys for a target device, forcing fallback to the signed
prekey only. This weakens forward secrecy for new sessions until the
device replenishes OTKs.

A separate but related concern: the client trusts Spire to deliver
honest key bundles. A malicious server could substitute its own keys,
establishing a MITM session. The existing session verification flow
(`sessions.verify()` / safety words) mitigates this when used, but
most users never verify.

**Mitigations to explore:**

- **Server-side rate limiting:** Limit key bundle requests per
  requester per target device per time window.
- **Recipient approval for new sessions:** Require the target user to
  approve a session initiation request before the server releases a
  key bundle. Adds latency but prevents silent draining.
- **OTK replenishment alerting:** Notify the user (or emit an event)
  when OTK supply drops below a threshold, so the app can warn or
  auto-replenish more aggressively.
- **Key transparency / signed key directory:** Publish key bundles to
  an append-only log that clients can audit, making server-side key
  substitution detectable.
- **TOFU with prominent UX:** Default to trust-on-first-use for the
  first session, but prominently surface fingerprint changes for
  subsequent sessions (Signal-style "safety number changed" warnings).

---

## No TLS certificate pinning

The library uses standard system CA trust for HTTPS and WSS connections.
There is no certificate pinning for known Spire hosts.

**Risk:** Corporate SSL inspection proxies, compromised CAs, or rogue
certificates on the device can intercept connections and steal tokens,
passwords, and observe ciphertext.

**Mitigations to explore:**

- **SPKI hash pinning** for known production hosts (e.g. `api.vex.wtf`),
  configurable via `ClientOptions`.
- Document certificate rotation procedures so pinning doesn't cause
  outages.

---

## `unsafeHttp` downgrade option

`ClientOptions.unsafeHttp` allows forcing `http://` and `ws://`,
removing all transport-layer confidentiality and integrity.

**Risk:** Network MITM steals Bearer tokens, device tokens, passwords,
and observes all traffic.

**Mitigations to explore:**

- Gate behind `NODE_ENV === 'development'` or a compile-time flag.
- Emit a prominent runtime warning when enabled.
- Refuse `unsafeHttp` in release/production builds.

---

## Mail replay / duplicate delivery

After HMAC verification and decryption, the client emits messages
without deduplicating on `mailID` or `(sender, nonce)`.

**Risk:** A malicious server could replay the same mail, causing
duplicate messages in the UI. Application-level idempotency bugs could
amplify the impact.

**Mitigations to explore:**

- Persist seen `mailID` or `(sender, nonce)` tuples in the database
  and skip duplicates on receipt.
- Align with receipt/ACK semantics so the server can confirm delivery
  and stop retransmitting.

---

## WebSocket error handler throws synchronously

The WebSocket `error` event handler throws directly from an event
listener, which can become an unhandled exception depending on the
runtime.

**Mitigations to explore:**

- Emit an `"error"` event on the client emitter instead of throwing.
- Schedule a reconnect attempt with backoff.
