# Team guide

This document is the handoff point for the Information Security project team.
Read it before changing the demo.

## 1. What we have today

The project is based on the
[CS4783 Project 2 reference](https://github.com/wecsam/CS4783-Project-2)
and has four parts:

1. **C++ election tools** (repository root): `admin-keygen`, `admin-tokens`,
   `cast-vote`, `tally-votes` and `imap-get-votes.py`. They perform the real
   Paillier encryption, the homomorphic tally and the integrity checks. See the
   README sections "Command-line election tools" and "Election integrity and
   confidentiality".
2. **Backend API** (`server/`): Node + SQLite. It stores elections, hashed
   tokens, ciphertext-only ballots and an audit log, and runs the C++ tools for
   all cryptography. See `server/README.md`.
3. **Interactive UI** (`ui.html`): real Paillier encryption in the browser, for
   a self-contained demo. See `README-UI.md`.
4. **Original demo UI** (`index.html`, `frontend/App.tsx`): overview, cast-a-ballot
   and integrity screens with seeded data. It is not yet connected to the API.

None of this is a production voting system. Never present it as one.

## 2. Run the project

Install Node.js 18 or newer, then run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, normally
`http://localhost:5173`.

Before opening a pull request, run:

```bash
npm run build
```

The build command runs TypeScript validation and creates the production bundle
in `dist/`. Do not commit `node_modules/` or `dist/`; they are ignored.

## 3. Important files

```text
frontend/App.tsx      Main screens and local demo state
frontend/styles.css   Dashboard layout, components, and responsive styles
frontend/main.tsx     React entry point
frontend/ui/          Interactive Paillier UI (entry page ui.html)
index.html            Browser entry point and page metadata
package.json      Scripts and dependencies
vite.config.ts    Vite configuration
README.md         Project overview and high-level roadmap
TEAM_GUIDE.md     This teammate handoff
```

Keep UI changes in `frontend/` (the backend has its own `server/src/`). Avoid adding backend, database, or cryptographic
logic directly into `App.tsx`; the next phase should extract those concerns
behind typed services.

## 4. Recommended implementation order

### Phase 1: Backend foundation

- Add an API service, preferably under `server/`.
- Add SQLite tables for elections, candidates, voter tokens, encrypted
  ballots, and audit events.
- Add environment-based configuration and a safe `.env.example`.
- Keep private keys outside source control and never log them.

### Phase 2: Cryptographic service

- Generate a Paillier key pair on election creation.
- Encode a vote as a one-hot vector or the representation agreed by the team.
- Encrypt the vote before persistence.
- Add ciphertexts homomorphically.
- Decrypt only the aggregate result.
- Write tests for encryption, aggregation, and final tally correctness.

### Phase 3: Integrity and abuse cases

The API must reject and record:

- Unknown voter tokens
- Reused voter tokens
- Modified ballot payloads or invalid authentication codes
- Invalid candidate values
- Ballots that do not match the election

Return explicit error responses. Do not silently accept malformed ballots.

### Phase 4: Connect the UI

Replace the seeded local state in `App.tsx` with API calls. Keep the current
three-screen flow so the viva walkthrough remains simple:

1. Create or open an election.
2. Submit a ballot using a one-time token.
3. Show that the ballot record contains ciphertext, not a candidate choice.
4. Run integrity checks.
5. Reveal only the final aggregate tally.

## 5. Git workflow

Create a branch for each focused change:

```bash
git switch -c feature/short-description
```

Then validate, commit, and push:

```bash
npm run build
git add .
git commit -m "Describe the change"
git push -u origin feature/short-description
```

Use pull requests for review. Keep commits focused and do not commit:

- `.env` files or credentials
- private keys, voter tokens, or real mailbox data
- `node_modules/`
- `dist/`

## 6. Viva checklist

Before the presentation:

- Build the C++ tools (`make`, `make tests`) and start the app and the API.
- Use a demo election with non-sensitive sample data. Run `make election-reset`
  first so that no old keys or votes are left over.

Command-line demo, about five minutes:

1. `./tests`: show that decryption undoes encryption and that multiplying two
   ciphertexts decrypts to the sum of the plaintexts.
2. `./admin-keygen` (for example 3 candidates, 5 voters) and `./admin-tokens`.
3. `./cast-vote | tee -a votes.txt` a few times with different tokens. Point out
   that two votes for the same candidate give completely different ciphertexts.
4. `./tally-votes <votes.txt`: only the total is decrypted.
5. Show the attacks being caught:
   - vote again with a token that was already used ("already been used");
   - vote with a made-up token ("never issued");
   - change one character of a ballot in a copy of `votes.txt` ("checksum is
     incorrect").

Explain, and be ready for questions on:

- why Paillier: additive homomorphism, so individual ballots are never decrypted;
- the vote encoding `(voters + 1)^(candidate - 1)` and why `admin-keygen` checks
  the key size;
- the checks for multi-vote ballots and unknown candidates;
- the known limitations in the README (homomorphic MAC forgery, colluding
  voters, trusted administrator).

Show the web parts too: `ui.html` for the in-browser flow, and the API if the UI
is connected by then.

## 7. Team ownership suggestion

- **Frontend**: UI polish, API integration, responsive presentation.
- **Backend**: API routes, SQLite schema, validation, audit records.
- **Cryptography**: Paillier implementation, encoding, key lifecycle, tests.
- **Documentation/testing**: threat model, setup instructions, viva script,
  test evidence, and deployment notes.

