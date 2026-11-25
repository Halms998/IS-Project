# Secure Ballot: Interactive UI

A working front end for the Secure Ballot project (our re-implementation of
[CS4783 Project 2](https://github.com/wecsam/CS4783-Project-2)). It runs **real Paillier
encryption inside the browser**, so the whole voting flow can be demonstrated without a
backend: set up an election, vote, tally homomorphically, and try to cheat.

> **Demo only.** Keys, tokens and ballots live in browser memory and disappear on reload.
> Admin and voter share one tab. Do not use this for a real election.

---

## 1. Run it

Requirements: Node.js 18+ and npm. No new dependencies were added.

```bash
npm install
npm run dev
```

Open **http://localhost:5173/ui.html**.

The original page at `/` is untouched. This UI lives on its own entry page, `ui.html`.

### Production build (optional)

`npm run dev` needs no config. To include `ui.html` in `npm run build`, add it to
`vite.config.ts`:

```ts
build: { rollupOptions: { input: { main: 'index.html', ui: 'ui.html' } } }
```

Then `npm run build && npm run preview` and open `/ui.html`.

---

## 2. Five-minute walkthrough

1. **Election setup**: keep the defaults and click *Generate keys and tokens*.
2. **Cast a ballot**: click *Fill an unused demo token*, pick a candidate, click
   *Encrypt and send ballot*. Repeat for a few voters.
3. **Tally**: click *Decrypt the final tally*. You get bars per candidate and three
   integrity checks, all passing.
4. **Attack lab**: run *Forged voter token*, *Vote twice* and *Modify a ballot in transit*.
   Each is blocked. Then run *One ballot, two votes* and open the **Tally** again: the
   attack was stored, but the integrity check now fails.
5. **Audit log**: every decision is listed.
6. **Homomorphism**: encrypt two numbers, multiply the ciphertexts, decrypt only the product.

---

## 3. Screens

| Screen | What it shows |
| --- | --- |
| **Election setup** | Name, 2 to 10 candidates (named, unlike the original's numbers), 2 to 500 voters, key size (512-bit instant, 1024-bit a few seconds). Shows the public key (`n`), its fingerprint, and a token table with Copy and *Download tokens.txt*. The private key is never displayed. |
| **Cast a ballot** | Token field plus candidate cards. The vote is encrypted in the browser. A paper-slip receipt shows the ballot ciphertext, the reverse ballot, the HMAC and the SHA-256 digest, or the reason it was refused. |
| **Tally** | Counters (ballots counted, tokens unused, rejected), the combined ciphertext, a *Decrypt the final tally* button, result bars and the integrity checks. Warns if new ballots arrived after the last tally. |
| **Attack lab** | Five attacks, each marked *Blocked* or *Stored*. See section 5. |
| **Audit log** | Time-stamped accepted / rejected / info events, with filters. |
| **Homomorphism** | Step-by-step `E(a) × E(b) = E(a+b)` using the election's key. Only the product is decrypted. |

---

## 4. How the cryptography works

This mirrors the original project's design.

- **Paillier** with `g = n + 1`. Encryption: `c = (1 + m·n) · rⁿ mod n²`. Because `r` is
  random, two votes for the same candidate give different ciphertexts.
- **Homomorphism.** Multiplying ciphertexts adds plaintexts, so the administrator multiplies
  all ballots and decrypts only the product.
- **One-hot vote in base (maxVoters + 1).** A vote for candidate *i* is `radix^i`. Counts
  cannot carry into the next candidate, so each "digit" of the decrypted total is one
  candidate's count.
- **Reverse ballot.** Each voter also sends `Enc(radix^(k-1-i))`. Reversing the reverse
  tally must reproduce the regular tally.
- **Authentication.** Each ballot carries an HMAC-SHA256 over both ciphertexts, keyed by the
  voter's token. The token itself is never sent, only its SHA-256 tag, which the server uses
  to look it up.
- **Tokens.** 128-bit random numbers, shown as 39 digits in groups of six. Uniqueness is
  guaranteed at generation.

### Validation order when a ballot arrives

1. Token tag unknown: **rejected** (forged token).
2. HMAC does not match: **rejected** (modified ballot).
3. Token already used: **rejected** (only the first ballot counts).
4. Otherwise stored encrypted and the token is marked used.

### Integrity checks at tally

| Check | Catches |
| --- | --- |
| Votes counted equal ballots received | A ballot that adds more than one vote |
| Reverse ballots mirror the regular tally | Inconsistent or stuffed ballots |
| No votes for unknown candidates | Votes encoded outside the candidate list |

If any check fails the UI says the result cannot be trusted.

---

## 5. Attack lab

| Attack | Result | Why |
| --- | --- | --- |
| Forged voter token | Blocked | Token tag not issued |
| Vote twice | Blocked | Token already used |
| Modify a ballot in transit | Blocked | HMAC mismatch |
| One ballot, two votes | **Stored**, flagged at tally | A real voter with a valid token and MAC. Only the aggregate check "votes = ballots" can see it without decrypting individual ballots |
| Unknown candidate | **Stored**, flagged at tally | Same reasoning: leftover value after decoding |

The last two are the important talking point: secrecy of individual ballots means some
cheating can only be detected in aggregate.

---

## 6. Project structure

```
ui.html                      entry page (served at /ui.html)
frontend/ui/
  main.tsx                   mounts the app
  SecureBallotApp.tsx        all screens and navigation
  election.ts                ElectionStore: setup, tokens, submit, tally, attacks
  paillier.ts                Paillier, Miller-Rabin, SHA-256, HMAC (BigInt + WebCrypto)
  ui.css                     styles; every class is prefixed `sb-`
```

- `ElectionStore` is a plain class holding all state. The React component keeps one
  instance and re-renders after each operation.
- `paillier.ts` and `election.ts` have no React dependency, so they can be unit tested
  directly.
- Nothing in the existing project is modified; these are new files only.

---

## 7. Differences from the original CS4783 project

| Original | This UI |
| --- | --- |
| C++ command-line tools | In-browser TypeScript |
| Ballots sent by email (SMTP/IMAP) | Submitted directly to the in-memory store |
| Candidates are numbers | Candidates are named |
| SHA-256 checksum concatenated with the token and encrypted | HMAC-SHA256 keyed by the token |
| Keys written to `public-key.txt` / `private-key.txt` | Keys held in memory only |

The C++ tools in the repo remain the reference implementation. This UI is for presenting
and understanding the system.

---

## 8. Known limitations

- Everything resets on reload. There is no persistence.
- The administrator and the voter run in the same tab, so the private key is in the same
  JavaScript memory as the voter page.
- 512-bit keys are for speed only and are not secure. Use 1024-bit or more for anything
  beyond a demo.
- BigInt arithmetic is not constant-time.
- No email transport, no real authentication for the administrator.

---

## 9. Connecting to the backend later

All election logic sits behind the `ElectionStore` methods (`setup`, `castVote`, `submit`,
`runTally`). When the backend (`server/`) is ready, replace the bodies of those methods with
`fetch` calls to the API and keep the screens as they are. Note the API numbers candidates
from 1 and returns voter tokens only once. A Vite dev proxy (`'/api'` to
`http://localhost:3001`) avoids CORS problems.

---

## 10. Testing checklist

- [ ] Setup with defaults creates 10 tokens and shows a public key fingerprint.
- [ ] A valid token and candidate gives an *accepted* slip; the token turns *Used*.
- [ ] Reusing a token shows *Ballot refused*.
- [ ] An empty or unknown token is refused.
- [ ] Tally counts match the votes you cast; all three checks pass.
- [ ] *Forged token*, *Vote twice* and *Modify a ballot* show *Blocked* and add
      `rejected` entries to the audit log.
- [ ] *One ballot, two votes* then *Decrypt the final tally* shows a failed check.
- [ ] Homomorphism with 17 and 25 decrypts to 42.
- [ ] The layout works on a narrow window (navigation becomes a top row).

---

## 11. Troubleshooting

| Problem | Fix |
| --- | --- |
| `/ui.html` shows the old UI or 404 | You opened `/`. Go to `/ui.html`. Make sure `ui.html` sits next to `index.html`. |
| Error about BigInt literals or target | Set `"target": "ES2020"` (or newer) in `tsconfig.app.json`. The code uses `BigInt()` calls, but the type needs ES2020 libs. |
| `crypto.subtle` is undefined | Use `http://localhost`, not a LAN IP address. WebCrypto needs a secure context. |
| 1024-bit setup feels stuck | It takes a few seconds. Use 512-bit for quick demos. |
| Styles look wrong on `/` | They shouldn't change. The stylesheet is only imported by the UI's own entry. |
