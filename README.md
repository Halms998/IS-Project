# Secure Ballot Demo

An initial web demonstration for an Information Security project based on the
[CS4783 Project 2](https://github.com/wecsam/CS4783-Project-2) reference
implementation. The reference project uses Paillier additive homomorphic
encryption to tally votes without decrypting individual ballots. This
iteration provides a presentable UI and local demo interactions first; the
cryptographic backend will be wired in next.

## What is included

- Election overview with live-looking encrypted tally cards.
- Cast-a-ballot flow with voter token validation and candidate selection.
- Integrity page showing the checks that should be demonstrated in a viva.
- Responsive dark dashboard UI.
- TypeScript, React, and Vite project structure ready for an API/backend.
- A [team handoff guide](./TEAM_GUIDE.md) with setup, workflow, roadmap, and
  viva instructions.

> **Important:** The current UI is a demonstration shell. It updates local
> browser state and does not yet perform real Paillier encryption or send email.
> Do not use it for real elections.

## Run locally

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview
```

## Project structure

```text
.
├── index.html
├── package.json
├── tsconfig*.json
├── vite.config.ts
└── src
    ├── App.tsx       # Demo screens and local interaction state
    ├── main.tsx      # React entry point
    └── styles.css    # Responsive dashboard styling
```

## Planned implementation phases

1. **Cryptographic service:** generate Paillier keys, encrypt a one-hot vote,
   combine ciphertexts, and decrypt only the final aggregate.
2. **Backend/API:** persist elections, one-time tokens, encrypted ballots, and
   audit events in SQLite.
3. **Integrity demonstrations:** reject invalid/duplicate tokens and tampered
   ciphertexts; add automated tests for each case.
4. **Deployment:** host the frontend and backend separately with demo-safe
   configuration and seeded data.

## Command-line election tools (C++)

The cryptographic core is a set of C++ programs based on the reference
implementation. They need GMP, Crypto++ and
[libpaillier](https://acsc.cs.utexas.edu/libpaillier).

| Tool | Purpose | Status |
| --- | --- | --- |
| `admin-keygen` | Create the election (name, vote e-mail address) and Paillier key pair; refuses elections too large for the key | Done |
| `admin-tokens` | Generate one unique voter token per voter into `tokens.txt` | Done |
| `cast-vote` | Encrypt a ballot and produce its authenticity code (MAC); also writes `email.txt` for `ssmtp` | Done |
| `imap-get-votes.py` | Download votes from an IMAP mailbox (subject `Vote: <election name>`, multipart supported) into `votes-downloaded.txt` | Done |
| `tally-votes` | Verify MACs, skip duplicate tokens, tally homomorphically, run integrity checks | Done |
| `tests` | Check key generation, encryption, decryption and homomorphic addition | Done |
| `make election-reset` | Delete the current election's keys, tokens and votes (asks first) | Done |

## Work in progress

| Area | Owner | Status |
| --- | --- | --- |
| C++ crypto core (`admin-keygen`, `cast-vote`, Paillier tests, `CryptoCommon`) | noor486 | Done |
| Key-size check, election name and e-mail, `email.txt`, `imap-get-votes.py`, Makefile cleanup, `election-reset` | noor486 | Done, merged to `main` |
| Integrity and confidentiality documentation (below) | noor486 | Done |
| `admin-tokens`, `tally-votes`, ciphertext and vote-radix fixes | Esar Fatima | Done, merged to `main` |
| Backend API (`server/`) with ballot validation | Esar Fatima | Merged to `main` (pull request #3); end-to-end run with the compiled C++ tools being verified |
| Interactive in-browser Paillier UI (`ui.html`, see [README-UI](./README-UI.md)) | Haleemah Zaheer | Done, merged to `main` |
| Connect the React UI to the API (replace seeded data in `src/App.tsx`) | Esar Fatima | Next |
| Viva script, test evidence | To be assigned | Not started |

Build and try it:

```bash
make                            # on Windows (MSYS2 UCRT64): mingw32-make
make tests && ./tests
./admin-keygen                  # numbers of candidates and voters, then election name and e-mail
./admin-tokens                  # writes tokens.txt (never overwrites an existing file)
./cast-vote | tee -a votes.txt  # enter a token from tokens.txt and pick a candidate
./tally-votes <votes.txt        # verify every envelope and print the results
make election-reset             # start over (deletes keys, tokens and votes)
```

To collect votes by e-mail instead, voters send `email.txt` (for example with
`ssmtp <address> <email.txt`) and the administrator downloads them:

```bash
python3 imap-get-votes.py imap.gmail.com admin@gmail.com   # asks for the (app) password
./tally-votes <votes-downloaded.txt
```

`public-key.txt`, `private-key.txt`, `tokens.txt`, `email.txt`, `votes.txt` and
`votes-downloaded.txt` are election secrets or data and are ignored by Git.
Never commit them.

### Building on Windows (MSYS2 UCRT64)

1. Install the dependencies:
   `pacman -S --needed mingw-w64-ucrt-x86_64-crypto++ mingw-w64-ucrt-x86_64-gmp mingw-w64-ucrt-x86_64-make mingw-w64-ucrt-x86_64-gcc`
2. Download `libpaillier-0.8.tar.gz` from
   <http://acsc.cs.utexas.edu/libpaillier/libpaillier-0.8.tar.gz> (the original
   `hms.isi.jhu.edu` host is offline).
3. Build it with an older C standard and explicit GMP paths:
   `./configure --prefix=/ucrt64 --with-gmp-include=/ucrt64/include --with-gmp-lib=/ucrt64/lib CFLAGS="-std=gnu89 -g -O2"`,
   then `make` and `make install`.
4. **Patch the random number source before installing.** libpaillier reads
   `/dev/urandom`, which does not exist for native Windows programs, so key
   generation hangs forever. In `paillier.c`:
   - add `#ifdef _WIN32` / `#define _CRT_RAND_S` / `#endif` as the first lines;
   - at the start of `paillier_get_rand_file`, under `#ifdef _WIN32`, fill `buf`
     using `rand_s()` (aborting if it fails) and `return;`.

   Then rebuild and reinstall libpaillier, delete the old `.exe` files and run
   `mingw32-make` again. Linux and WSL do not need this patch.

## Election integrity and confidentiality

In a real election, people are motivated to change the result. Even voters with
genuine tokens may try to vote twice or vote for more than one candidate. This
section lists the attacks the C++ tools defend against, how, and what is still
out of scope.

**How a ballot is built.** `cast-vote` encodes a vote for candidate *k* as
`(voters + 1)^(k - 1)`, so each candidate gets its own "digit" in base
`voters + 1`. It encrypts that number with the 2048-bit Paillier public key.
It then encrypts an authenticity value, `token × 2^256 + SHA-256(ballot ciphertext)`,
with the same key. The two ciphertexts, BALLOT and MAC, form one envelope.

### Seeing other people's votes
- Ballots are encrypted with a 2048-bit Paillier key. Only the election
  administrator holds `private-key.txt`.
- Paillier encryption is randomized, so two votes for the same candidate give
  completely different ciphertexts. Comparing envelopes reveals nothing.
- `tally-votes` multiplies all accepted ballot ciphertexts together, which adds
  the plaintexts (additive homomorphism), and decrypts **only the total**. No
  individual ballot is ever decrypted.
- The voter token travels inside the encrypted MAC, so someone reading the
  e-mail cannot learn it. Sending through an SMTP server with STARTTLS adds
  transport encryption on top.

### Voting without permission
- `admin-tokens` creates one unique, random 128-bit token per voter from the
  operating system's secure random source. A token cannot realistically be guessed.
- `tally-votes` decrypts each MAC, takes the token out of it and rejects the
  envelope if that token is not in `tokens.txt` ("the token was never issued").

### Voting more than once
- When two envelopes carry the same token, only the first is counted and the
  rest are rejected ("this token has already been used"). Accidentally sending
  the same e-mail twice is therefore harmless.
- If more ballots are accepted than the number of voters the election was set
  up for, the results are marked as untrustworthy.

### Modifying a ballot in transit
- `tally-votes` recomputes the SHA-256 checksum of each ballot ciphertext and
  compares it with the checksum inside the decrypted MAC. A changed ballot is
  rejected ("the checksum is incorrect").

### Ballots with more than one vote, or votes for unknown candidates
Paillier lets a voter encrypt any number, not just a valid vote. After the tally:
- The votes found must equal the number of ballots counted. A ballot worth two
  votes, or one vote for each of two candidates, breaks this equality, and the
  results are marked as untrustworthy.
- The total must be smaller than `(voters + 1)^candidates`. A larger total means
  a vote for a candidate that does not exist.
- `admin-keygen` refuses to create an election where `(voters + 1)^candidates`
  does not fit under the public key. Otherwise the total could wrap around the
  modulus and give wrong counts without any warning.

When any of these checks fails, `tally-votes` prints a warning and exits with
code 4, so the backend can show that the results cannot be trusted.

### Known limitations
These are honest gaps, worth knowing for a viva:
- **The MAC can be adjusted homomorphically.** The MAC is encrypted with the
  public key, and the checksum of any ciphertext is public. An attacker who
  replaces a ballot can multiply the MAC by `E(new checksum - old checksum)`, and
  the forged envelope passes the checksum check with the original token. A real
  fix would be a signature, or an HMAC keyed with a secret the attacker does not
  know, instead of an encrypted checksum.
- **Colluding voters can hide invalid ballots.** One voter casting two votes
  while another casts an encryption of 0 keeps "votes found = ballots counted".
  The reference project adds a reverse ballot for extra checking. The complete
  solution is a zero-knowledge proof that each ballot encrypts exactly one valid
  vote.
- **The administrator is trusted.** Whoever holds the private key and
  `tokens.txt` could decrypt single ballots or link tokens to voters. Splitting
  the key between several trustees (threshold decryption) would remove this.
- **Secrets are plain files.** `private-key.txt` and `tokens.txt` are stored
  unencrypted. They are ignored by Git and must never be committed or shared.

## Backend API

The `server/` folder is a Node + SQLite API that stores elections, tokens, encrypted ballots and
an audit log, and runs the C++ tools above for all cryptography. See
[`server/README.md`](./server/README.md) for setup, configuration and the API reference.

## Contributions

### Esaar Fatima

- Set up the initial backend structure and shared types/seed data
  (`src/types`, `src/data`, `server/` skeleton) via pull request #1.
- Added **`admin-tokens`**: generates one unique random 128-bit voter token per
  voter (39 digits, shown in hyphenated groups so they are easy to type) from
  the voter count in `public-key.txt`, and refuses to overwrite an existing
  `tokens.txt`. Wired it into the `Makefile` and updated `.gitignore` for
  `tokens.txt` and `votes-downloaded.txt`.
- Worked out and documented the Windows (MSYS2) build, including the
  libpaillier random-number fix above.
- Built the **backend API** in `server/`: elections, hashed voter tokens, ciphertext-only
  ballot storage, an audit log, explicit rejection of unknown, reused and malformed ballots,
  admin-key protected routes, and a runner that calls the C++ tools, with automated tests.
- Updated this README.

### noor486

- Rebuilt the C++ core step by step from the reference: `paillier.h`, the
  `Makefile`, and `tests` for key generation, encryption, decryption and
  homomorphic addition.
- Added the shared **`CryptoCommon`** module (base 64, SHA-256, token
  sanitizing, and one public key file reader used by every tool).
- Added **`admin-keygen`** with a check that `(voters + 1)^candidates` fits
  under the public key, and the election name and vote e-mail address.
- Added **`cast-vote`**, including writing `email.txt` for `ssmtp`.
- Added **`imap-get-votes.py`** to download votes from a mailbox, with
  multipart e-mail support.
- Cleaned up the `Makefile` (libraries only when linking, optimization,
  `make clean`, `make election-reset`).
- Wrote the election integrity and confidentiality section, including the
  known limitations.

See `git log` for the full history of every contributor.

## Viva walkthrough

Use the sidebar to show the overview, submit a ballot using any non-empty demo
token, then open **Verify integrity**. Explain that the displayed ciphertext is
not a candidate choice and that the final tally is the only value intended to
be decrypted.
