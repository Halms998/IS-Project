# Team guide

This document is the handoff point for the Information Security project team.
Read it before changing the demo.

## 1. What we have today

The project is a React + TypeScript + Vite demonstration UI inspired by the
[CS4783 Project 2 reference](https://github.com/wecsam/CS4783-Project-2).
The current UI has three flows:

1. **Election overview**: shows a seeded election, live-looking tally cards,
   protocol status, and encrypted ballot records.
2. **Cast a ballot**: accepts a demo token, lets a user choose a candidate, and
   updates local browser state.
3. **Verify integrity**: displays the integrity checks that the final system
   must perform.

The current version is intentionally a **frontend-only demo shell**. It does
not yet perform real Paillier encryption, persist data, send email, or provide
authentication. Never present it as a production voting system.

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
src/App.tsx       Main screens and local demo state
src/styles.css    Dashboard layout, components, and responsive styles
src/main.tsx      React entry point
index.html        Browser entry point and page metadata
package.json      Scripts and dependencies
vite.config.ts    Vite configuration
README.md         Project overview and high-level roadmap
TEAM_GUIDE.md     This teammate handoff
```

Keep UI changes in `src/`. Avoid adding backend, database, or cryptographic
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

- Start the app before the presentation.
- Use a seeded demo election with non-sensitive sample data.
- Show the encrypted ballot payload and explain that it is not readable as a
  candidate choice.
- Submit a ballot with a demo token.
- Try an empty token and explain input validation.
- Show the integrity screen and explain duplicate-token and tamper checks.
- Explain that the present UI is a shell until the backend and cryptographic
  service are connected.

## 7. Team ownership suggestion

- **Frontend**: UI polish, API integration, responsive presentation.
- **Backend**: API routes, SQLite schema, validation, audit records.
- **Cryptography**: Paillier implementation, encoding, key lifecycle, tests.
- **Documentation/testing**: threat model, setup instructions, viva script,
  test evidence, and deployment notes.

