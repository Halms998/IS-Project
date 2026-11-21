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
| `admin-keygen` | Create the election and Paillier key pair | Done |
| `admin-tokens` | Generate one unique voter token per voter into `tokens.txt` | Done |
| `cast-vote` | Encrypt a ballot and produce its authenticity code (MAC) | Done |
| `tally-votes` | Verify MACs, skip duplicate tokens, tally homomorphically, run integrity checks | To do |
| `tests` | Check key generation, encryption, decryption and homomorphic addition | Done |

Build and try it:

```bash
make            # on Windows (MSYS2 UCRT64): mingw32-make
make tests && ./tests
./admin-keygen  # asks for the numbers of candidates and voters
./admin-tokens  # writes tokens.txt (never overwrites an existing file)
./cast-vote     # enter a token from tokens.txt and pick a candidate
```

`public-key.txt`, `private-key.txt`, `tokens.txt` and `votes-downloaded.txt` are
election secrets or data and are ignored by Git. Never commit them.

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
- Updated this README.

See `git log` for the full history of every contributor.

## Viva walkthrough

Use the sidebar to show the overview, submit a ballot using any non-empty demo
token, then open **Verify integrity**. Explain that the displayed ciphertext is
not a candidate choice and that the final tally is the only value intended to
be decrypted.
