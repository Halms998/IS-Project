# Secure Ballot API

The backend for the Secure Ballot demo (Phase 1 of the [team guide](../TEAM_GUIDE.md)). It is a
Node + Express + SQLite service that stores elections, voter tokens, encrypted ballots and an
audit log, and does all cryptography by running the team's C++ programs
(`admin-keygen`, `admin-tokens`, `cast-vote`, `tally-votes`).

> **Demo limitation.** In this version the voter sends their token and chosen candidate to the
> API, and the server runs `cast-vote` to encrypt it. The server therefore briefly sees the
> choice in memory. It never writes the choice to the database or the audit log, and it stores
> only ciphertext. A production system would encrypt on the voter's own device. Do not use this
> for a real election.

## Setup

Requirements: Node.js 18 or newer, and the C++ tools built in the repository root
(`make`, or `mingw32-make` on Windows).

```bash
cd server
npm install
cp .env.example .env        # on Windows: copy .env.example .env
```

Edit `.env` and set at least `ADMIN_API_KEY` (at least 16 characters). Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

**Windows (MSYS2):** the C++ programs need the MSYS2 DLLs. In an MSYS2 UCRT64 terminal run
`cygpath -w /ucrt64/bin` and put the result in `CRYPTO_DLL_DIR`, for example
`CRYPTO_DLL_DIR=C:\msys64\ucrt64\bin`.

Run it:

```bash
npm run dev      # restarts on changes
npm run build && npm start
```

The API listens on `http://localhost:3001/api`. The server refuses to start without a valid
`ADMIN_API_KEY`.

## Configuration (`.env`)

| Variable | Meaning | Default |
| --- | --- | --- |
| `PORT` | Port to listen on | `3001` |
| `ADMIN_API_KEY` | Secret for admin routes (required) | none |
| `DATABASE_PATH` | SQLite file | `./data/ballot.db` |
| `DATA_DIR` | One folder per election, holding its key files and `tokens.txt` | `./data/elections` |
| `CRYPTO_BIN_DIR` | Folder with the compiled C++ programs | `..` (repository root) |
| `CRYPTO_DLL_DIR` | Windows only: MSYS2 DLL folder | empty |
| `CRYPTO_TIMEOUT_MS` | Stop a C++ program after this long | `120000` |

`server/data/` contains **private keys and tokens**. It is ignored by Git. Never commit it.

## API

All responses are JSON. Errors always look like
`{ "error": { "code": "TOKEN_ALREADY_USED", "message": "..." } }`.
Admin routes need the header `x-admin-key: <ADMIN_API_KEY>`.

| Method and path | Who | What it does |
| --- | --- | --- |
| `GET /api/health` | anyone | Liveness check |
| `POST /api/elections` | admin | Create an election: body `{ "name", "candidates": [..], "numVoters" }`. Runs `admin-keygen` and `admin-tokens`. Returns the election **and the voter tokens, once**. |
| `GET /api/elections` | anyone | List elections |
| `GET /api/elections/:id` | anyone | Election details with counts of tokens issued, tokens used and ballots |
| `POST /api/elections/:id/ballots` | anyone with a token | Cast a vote: body `{ "token", "candidate" }` (candidate is 1-based). Returns the ciphertext ballot and MAC. |
| `GET /api/elections/:id/ballots` | anyone | The stored ballot records: ciphertext only, never a candidate |
| `POST /api/elections/:id/tally` | admin | Verify every ballot, decrypt only the total, close voting, return counts per candidate and any integrity warnings |
| `GET /api/elections/:id/audit` | admin | The audit log |

### Rejections

Every rejected ballot is answered with an explicit error and recorded in the audit log.

| Situation | Status | Code |
| --- | --- | --- |
| Token missing, empty, or not digits and hyphens | 400 | `INVALID_TOKEN_FORMAT` |
| Candidate not a whole number from 1 to the number of candidates | 400 | `INVALID_CANDIDATE` |
| Token was never issued for this election | 403 | `UNKNOWN_TOKEN` |
| Token already used | 409 | `TOKEN_ALREADY_USED` |
| Voting has ended (election tallied) | 409 | `ELECTION_CLOSED` |
| A C++ program failed | 502 | `CRYPTO_FAILURE` (the token is released so the voter can retry) |
| Missing or wrong admin key | 401 | `UNAUTHORIZED` |

Tampered ballots and forged authenticity codes cannot be judged one at a time without decrypting,
so they are caught by `tally-votes`: its warnings and rejection reasons are returned by the
tally route, and a result with any warning has `"trustworthy": false`.

### Example (PowerShell)

```powershell
$h = @{ 'x-admin-key' = 'YOUR_ADMIN_API_KEY' }
$e = Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/elections -Headers $h `
  -ContentType 'application/json' `
  -Body '{"name":"Class rep","candidates":["Ayesha","Bilal","Chand"],"numVoters":5}'
$e.tokens                      # hand one token to each voter

Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/elections/1/ballots `
  -ContentType 'application/json' -Body ('{"token":"' + $e.tokens[0] + '","candidate":2}')

Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/elections/1/tally -Headers $h
```

## Design notes

- **Ballot secrecy.** The `ballots` table has no candidate column and no link to a voter token.
  Tokens are stored only as SHA-256 hashes with a used flag.
- **No double spending.** A token is claimed with a single atomic `UPDATE ... WHERE used = 0`
  before encryption, so simultaneous requests cannot both succeed. If encryption fails the token
  is released.
- **Only the total is decrypted.** The tally runs `tally-votes`, which multiplies the ciphertexts
  and decrypts only the product.
- **Admin key comparison** is constant-time, and failed attempts are audited.
- **The cryptography is swappable.** Everything cryptographic goes through the `CryptoRunner`
  interface (`src/types`), so tests use a stand-in and the real server uses `CliCryptoRunner`.

## Layout

```text
server/
├── src/
│   ├── config/       .env loading and validation
│   ├── database/     SQLite schema
│   ├── crypto/       CliCryptoRunner: runs and parses the C++ programs
│   ├── services/     election, token and audit logic
│   ├── controllers/  request handling
│   ├── middleware/   admin key check, error handling
│   ├── routes/       URL map
│   ├── app.ts        builds the Express app
│   └── index.ts      starts the server
└── tests/
```

## Tests

```bash
npm test
npm run typecheck
```

The tests use an in-memory database and a stand-in for the C++ programs, parse real output
captured from `cast-vote` and `tally-votes`, and run the process-spawning code against small mock
programs (skipped on Windows). They do **not** run the real cryptography: check that by running
the C++ tools themselves, as described in the main README.

## What is next

Phase 4: replace the seeded data in `src/App.tsx` with calls to this API (a Vite dev proxy to
`http://localhost:3001` is the simplest way).
