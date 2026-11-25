# Test evidence

Evidence that the Secure Ballot system works and defends against the attacks in its
threat model. Each section has the command to run, the result to expect, and a fenced
block for the **actual** output captured on your machine. Paste your real output into the
empty blocks; do not edit the numbers by hand.

- Environment: Ubuntu on WSL, GMP + Crypto++ + libpaillier, Node 20 for the backend.
- Build the tools first: `make` (and `make tests` for the test program).
- `>>>` marks a value you type.

---

## 1. Cryptographic core (`tests`)

Shows that decryption undoes encryption, and that multiplying two ciphertexts decrypts to
the sum of the plaintexts (the additive homomorphism the whole system relies on).

```bash
make tests
./tests
```

Expect: line 1 has `m` equal to `m'=D(E(m))`; line 2 has `(m'+m_2) mod n` equal to
`D(E(m')*E(m_2) mod n^2)`.

```text
(paste ./tests output here)
```

---

## 2. A clean election, end to end (command-line tools)

```bash
make election-reset        # answer y
./admin-keygen             # >>> 3 candidates, 5 voters, a name, an e-mail
./admin-tokens
cat tokens.txt
```

```text
(paste output; tokens.txt should list 5 tokens)
```

Cast three votes, each with a different token from `tokens.txt`:

```bash
./cast-vote | tee -a votes.txt    # repeat 3 times, different token each time
```

Tally:

```bash
./tally-votes <votes.txt
echo "exit code: $?"
```

Expect: counts per candidate, `Envelopes received: 3`, `Ballots counted: 3`,
`Envelopes rejected: 0`, no warnings, and **exit code 0**.

```text
(paste ./tally-votes output and the exit code here)
```

---

## 3. Attacks the tally rejects

All three reuse the election from section 2.

### 3a. A reused voter token (double voting)

Cast another vote with a token you already used, then tally again:

```bash
./cast-vote | tee -a votes.txt    # >>> a token already used above
./tally-votes <votes.txt
```

Expect: `Rejected: envelope N: this token has already been used`; still 3 ballots counted.

```text
(paste the rejection line and the counts here)
```

### 3b. A token that was never issued (forged token)

```bash
./cast-vote | tee -a votes.txt    # >>> a made-up number such as 12345-67890
./tally-votes <votes.txt
```

Expect: `Rejected: envelope N: the token was never issued`.

```text
(paste the rejection line here)
```

### 3c. A modified ballot (tampering)

```bash
cp votes.txt tampered.txt
# edit tampered.txt: change one character inside the first ---BEGIN:BALLOT--- block, save
./tally-votes <tampered.txt
rm tampered.txt
```

Expect: `Rejected: envelope 1: the checksum is incorrect, so the ballot was modified`.

```text
(paste the rejection line here)
```

### 3d. A ballot with more than one vote (aggregate check)

A single ballot that encodes two votes cannot be seen on its own, but the final totals
catch it: the votes found no longer equal the ballots counted.

```bash
# Demonstrated in the interactive UI (ui.html, Attack lab -> "One ballot, two votes"),
# which flags it at tally time, or by crafting such a ballot by hand.
```

```text
(paste the UI's tally warning, or describe how it was shown)
```

---

## 4. The HMAC fix for MAC forgery (`forge-ballot.py`)

The reference design put a plain `SHA-256(ballot)` inside the MAC, which let an attacker
replace a ballot and adjust the MAC homomorphically, using only public information. This
project keys the MAC with an HMAC over the voter token, which closes the hole.

### 4a. The attack is rejected by the current (HMAC) build

```bash
python3 forge-ballot.py votes.txt 1 > forged.txt
./tally-votes <forged.txt
rm forged.txt
```

Expect: `Rejected: envelope 1: the checksum is incorrect, so the ballot was modified`.

```text
(paste the rejection line here)
```

### 4b. The same attack succeeds against the old design (for contrast)

Run the whole demo on the commit just before the HMAC change. These votes must be made by
the **old** `cast-vote`, so a fresh election is set up on that commit.

```bash
git switch cfb8222 --detach
make
make election-reset        # answer y
./admin-keygen             # >>> 3 candidates, 5 voters
./admin-tokens
./cast-vote | tee -a oldvotes.txt   # 3 times, different tokens
python3 forge-ballot.py oldvotes.txt 1 > forged.txt
./tally-votes <forged.txt
rm forged.txt oldvotes.txt
git switch main
make
```

Expect: 3 ballots counted, **no rejection**, and candidate 1 has gained the forged vote.
That is the attack working on the reference design.

```text
(paste the old-design ./tally-votes output here)
```

---

## 5. Backend API with the real C++ tools

The backend stores only ciphertext and token hashes, runs the C++ programs for all
cryptography, and records every decision in an audit log.

### 5a. Automated tests

```bash
cd server
npm test
npm run typecheck
```

Expect: all tests pass (`pass N`, `fail 0`); `typecheck` prints nothing.

```text
(paste the final test summary here)
```

### 5b. End-to-end through the API

With `npm run dev` running and `KEY` set to `ADMIN_API_KEY` from `.env`:

```bash
curl -s localhost:3001/api/health
curl -s -X POST localhost:3001/api/elections -H "x-admin-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Class rep","candidates":["Ayesha","Bilal","Chand"],"numVoters":5}'
# cast a few ballots with the returned tokens, then:
curl -s -X POST localhost:3001/api/elections/1/tally -H "x-admin-key: $KEY"
curl -s localhost:3001/api/elections/1/audit -H "x-admin-key: $KEY"
```

Expect: health `{"status":"ok"}`; stored ballots show ciphertext only; the tally returns
counts with `"trustworthy": true`; the audit log lists accepted and rejected ballots.

```text
(paste the tally JSON and a few audit rows here)
```

---

## Summary

| # | What it proves | Result |
| --- | --- | --- |
| 1 | Encryption, decryption and homomorphic addition | |
| 2 | A full election tallies correctly | |
| 3a | Reused tokens are rejected | |
| 3b | Unissued tokens are rejected | |
| 3c | Tampered ballots are rejected | |
| 3d | Multi-vote ballots are caught at tally | |
| 4a | MAC forgery is rejected (HMAC build) | |
| 4b | MAC forgery succeeds on the old design | |
| 5a | Backend test suite passes | |
| 5b | Backend end-to-end with real crypto | |

Fill the Result column with Pass / Fail as you complete each section.
