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

## Viva walkthrough

Use the sidebar to show the overview, submit a ballot using any non-empty demo
token, then open **Verify integrity**. Explain that the displayed ciphertext is
not a candidate choice and that the final tally is the only value intended to
be decrypted.
