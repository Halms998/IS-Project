import { useReducer, useState } from 'react';
import { ElectionStore, formatToken, shortHex } from './election';
import type {
  AttackKind,
  AttackReport,
  AuditKind,
  Ballot,
  SubmitOutcome,
  TallyResult,
} from './election';

type Page = 'setup' | 'vote' | 'tally' | 'attacks' | 'audit' | 'math';

const NAV: { id: Page; label: string; hint: string }[] = [
  { id: 'setup', label: 'Election setup', hint: 'Keys and voter tokens' },
  { id: 'vote', label: 'Cast a ballot', hint: 'The voter’s view' },
  { id: 'tally', label: 'Tally', hint: 'Decrypt only the total' },
  { id: 'attacks', label: 'Attack lab', hint: 'Try to cheat' },
  { id: 'audit', label: 'Audit log', hint: 'Every decision' },
  { id: 'math', label: 'Homomorphism', hint: 'Add without decrypting' },
];

interface PageProps {
  store: ElectionStore;
  refresh: () => void;
  go: (page: Page) => void;
}

function PageHead({ title, children }: { title: string; children: string }) {
  return (
    <header className="sb-head">
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  );
}

function NeedElection({ go }: { go: (page: Page) => void }) {
  return (
    <div className="sb-empty">
      <h2>No election yet</h2>
      <p>Create an election to generate the encryption keys and voter tokens.</p>
      <button className="sb-btn" onClick={() => go('setup')}>
        Go to election setup
      </button>
    </div>
  );
}

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text);
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ setup */

function SetupPage({ store, refresh }: PageProps) {
  const [name, setName] = useState('Student Council 2026');
  const [names, setNames] = useState('Alice Khan\nBilal Ahmed\nCarla Mendes');
  const [voters, setVoters] = useState(10);
  const [bits, setBits] = useState(512);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const cfg = store.config;

  async function create() {
    const candidates = names
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim()) return setError('Give the election a name.');
    if (candidates.length < 2 || candidates.length > 10) return setError('List between 2 and 10 candidates, one per line.');
    if (!Number.isInteger(voters) || voters < 2 || voters > 500) return setError('Choose between 2 and 500 voters.');
    setError('');
    setBusy(true);
    try {
      await store.setup({ name: name.trim(), candidates, maxVoters: voters, keyBits: bits }, setProgress);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
    refresh();
  }

  return (
    <>
      <PageHead title="Election setup">
        The administrator names the candidates, sets how many voters there can be, and generates the key pair. Everything runs in this browser tab.
      </PageHead>
      <div className="sb-banner">
        Demonstration only. Keys and tokens live in memory and disappear when you reload. Do not use this for a real election.
      </div>

      <section className="sb-card">
        <h2>{cfg ? 'Create a new election' : 'New election'}</h2>
        <div className="sb-field">
          <label htmlFor="sb-name">Election name</label>
          <input id="sb-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="sb-field">
          <label htmlFor="sb-cands">Candidates</label>
          <textarea id="sb-cands" value={names} onChange={(e) => setNames(e.target.value)} />
          <small>One name per line, from 2 to 10.</small>
        </div>
        <div className="sb-row">
          <div className="sb-field">
            <label htmlFor="sb-voters">Maximum voters</label>
            <input id="sb-voters" type="number" min={2} max={500} value={voters} onChange={(e) => setVoters(Number(e.target.value))} />
            <small>Issue a few spare tokens in case one is lost.</small>
          </div>
          <div className="sb-field">
            <label htmlFor="sb-bits">Key size</label>
            <select id="sb-bits" value={bits} onChange={(e) => setBits(Number(e.target.value))}>
              <option value={512}>512-bit (instant, for demos)</option>
              <option value={1024}>1024-bit (a few seconds)</option>
            </select>
          </div>
        </div>
        <div className="sb-actions">
          <button className="sb-btn" onClick={create} disabled={busy}>
            {busy ? 'Generating keys…' : 'Generate keys and tokens'}
          </button>
          {busy && <span className="sb-mono">{progress}</span>}
        </div>
        {error && <p className="sb-error">{error}</p>}
      </section>

      {cfg && store.pub && (
        <>
          <section className="sb-card">
            <h2>{cfg.name}</h2>
            <div className="sb-grid">
              <div className="sb-stat"><b>{cfg.candidates.length}</b><span>candidates</span></div>
              <div className="sb-stat"><b>{store.tokens.length}</b><span>voter tokens</span></div>
              <div className="sb-stat"><b>{store.pub.bits}</b><span>bit modulus</span></div>
              <div className="sb-stat"><b className="sb-mono" style={{ fontSize: '1.05rem' }}>{store.keyFingerprint}</b><span>public key fingerprint</span></div>
            </div>
            <p style={{ marginBottom: 6 }}>Public key (n)</p>
            <div className="sb-cipher">{shortHex(store.pub.n, 48, 16)}</div>
            <p style={{ color: 'var(--sb-mute)', fontSize: '0.88rem' }}>
              The private key stays inside the administrator’s store and is only used on the combined total.
            </p>
          </section>

          <section className="sb-card">
            <h2>Voter tokens</h2>
            <div className="sb-actions" style={{ marginBottom: 14 }}>
              <button className="sb-btn is-ghost" onClick={() => download('tokens.txt', store.tokens.map(formatToken).join('\n') + '\n')}>
                Download tokens.txt
              </button>
              <button className="sb-btn is-ghost" onClick={() => copyText(store.tokens.map(formatToken).join('\n'))}>
                Copy all
              </button>
            </div>
            <div className="sb-table-wrap">
              <table className="sb-table">
                <thead>
                  <tr><th>#</th><th>Token</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {store.tokens.map((t, i) => (
                    <tr key={t}>
                      <td>{i + 1}</td>
                      <td className="sb-mono">{formatToken(t)}</td>
                      <td>
                        {store.used.has(t) ? <span className="sb-badge is-warn">Used</span> : <span className="sb-badge is-ok">Unused</span>}
                      </td>
                      <td>
                        <button className="sb-btn is-ghost is-small" onClick={() => copyText(formatToken(t))}>Copy</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------- vote */

function VotePage({ store, refresh, go }: PageProps) {
  const [token, setToken] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ ballot: Ballot; result: SubmitOutcome } | null>(null);
  const cfg = store.config;
  if (!cfg) return <NeedElection go={go} />;

  async function send() {
    if (choice === null) return;
    setBusy(true);
    const outcome = await store.castVote(token, choice);
    setSent(outcome);
    setBusy(false);
    if (outcome.result.ok) {
      setToken('');
      setChoice(null);
    }
    refresh();
  }

  const spare = store.nextUnusedToken();

  return (
    <>
      <PageHead title="Cast a ballot">
        Enter your voter token and pick one candidate. Your choice is encrypted here, in the browser, before anything is sent.
      </PageHead>
      <section className="sb-card">
        <div className="sb-field">
          <label htmlFor="sb-token">Voter token</label>
          <input id="sb-token" className="sb-mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder="000000-000000-…" autoComplete="off" />
          <div className="sb-actions">
            <button className="sb-btn is-ghost is-small" disabled={!spare} onClick={() => spare && setToken(formatToken(spare))}>
              Fill an unused demo token
            </button>
          </div>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: '0 0 18px' }}>
          <legend style={{ fontWeight: 600, marginBottom: 8 }}>Candidate</legend>
          <div className="sb-choices">
            {cfg.candidates.map((c, i) => (
              <label className="sb-choice" key={c + i}>
                <input type="radio" name="sb-candidate" checked={choice === i} onChange={() => setChoice(i)} />
                <span>{c}<small>Candidate {i + 1}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="sb-btn" onClick={send} disabled={busy || choice === null || token.replace(/\D/g, '').length === 0}>
          {busy ? 'Encrypting…' : 'Encrypt and send ballot'}
        </button>
      </section>

      {sent && (
        <section className={'sb-slip' + (sent.result.ok ? '' : ' is-refused')} aria-live="polite">
          <h3>{sent.result.ok ? `Ballot #${sent.result.seq} accepted` : 'Ballot refused'}</h3>
          <p>
            {sent.result.ok
              ? 'Your vote was stored as ciphertext. What follows is all the administrator can see of it.'
              : sent.result.reason}
          </p>
          <dl>
            <dt>Encrypted ballot</dt>
            <dd>{shortHex(sent.ballot.cipher, 56, 16)}</dd>
            <dt>Reverse ballot</dt>
            <dd>{shortHex(sent.ballot.reverse, 56, 16)}</dd>
            <dt>Authentication code (HMAC-SHA256)</dt>
            <dd>{sent.ballot.mac}</dd>
            <dt>Ballot digest (SHA-256)</dt>
            <dd>{sent.ballot.digest}</dd>
          </dl>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ tally */

function TallyPage({ store, refresh, go }: PageProps) {
  const [result, setResult] = useState<TallyResult | null>(null);
  const cfg = store.config;
  if (!cfg) return <NeedElection go={go} />;

  function run() {
    setResult(store.runTally());
    refresh();
  }

  const stale = result !== null && result.accepted !== store.ballots.length;
  const max = result ? Math.max(1, ...result.counts) : 1;
  const aggregate = store.ballots.length > 0 ? shortHex(store.aggregateCipher(), 56, 16) : 'No ballots yet';

  return (
    <>
      <PageHead title="Tally">
        Ballots are multiplied together while still encrypted. Only the combined total is decrypted, never a single vote.
      </PageHead>
      <section className="sb-card">
        <div className="sb-grid">
          <div className="sb-stat"><b>{store.ballots.length}</b><span>ballots counted</span></div>
          <div className="sb-stat"><b>{store.tokens.length - store.used.size}</b><span>tokens unused</span></div>
          <div className="sb-stat"><b>{store.rejectedCount}</b><span>ballots rejected</span></div>
        </div>
        <p style={{ marginBottom: 6 }}>Combined ciphertext of all ballots</p>
        <div className="sb-cipher">{aggregate}</div>
        <div className="sb-actions" style={{ marginTop: 16 }}>
          <button className="sb-btn" onClick={run}>Decrypt the final tally</button>
          {stale && <span className="sb-badge is-warn">New ballots since this tally. Decrypt again.</span>}
        </div>
      </section>

      {result && (
        <>
          <div className={'sb-verdict ' + (result.trusted ? 'is-ok' : 'is-bad')}>
            {result.trusted
              ? 'All integrity checks passed. The result can be trusted.'
              : 'An integrity check failed. These numbers cannot be trusted.'}
          </div>
          <section className="sb-card">
            <h2>Results</h2>
            <div className="sb-bars">
              {cfg.candidates.map((c, i) => (
                <div key={c + i}>
                  <div className="sb-bar-top"><span>{c}</span><b>{result.counts[i]}</b></div>
                  <div className="sb-track"><div className="sb-fill" style={{ width: `${(result.counts[i] / max) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </section>
          <section className="sb-card">
            <h2>Integrity checks</h2>
            <ul className="sb-checks">
              {result.checks.map((c) => (
                <li key={c.label}>
                  <span className={'sb-badge ' + (c.ok ? 'is-ok' : 'is-bad')}>{c.ok ? 'Pass' : 'Fail'}</span>
                  <div>{c.label}<small>{c.detail}</small></div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- attacks */

const ATTACKS: { kind: AttackKind; title: string; blurb: string }[] = [
  { kind: 'fake-token', title: 'Forged voter token', blurb: 'Vote with a token the administrator never issued.' },
  { kind: 'double-vote', title: 'Vote twice', blurb: 'Replay a token that has already voted, for a different candidate.' },
  { kind: 'tamper', title: 'Modify a ballot in transit', blurb: 'Change the ciphertext after it was authenticated.' },
  { kind: 'multi-vote', title: 'One ballot, two votes', blurb: 'A real voter encrypts a ballot that adds votes for two candidates.' },
  { kind: 'unknown-candidate', title: 'Unknown candidate', blurb: 'A real voter encrypts a vote for a candidate that is not on the list.' },
];

function AttacksPage({ store, refresh, go }: PageProps) {
  const [busy, setBusy] = useState<AttackKind | null>(null);
  const [reports, setReports] = useState<AttackReport[]>([]);
  if (!store.config) return <NeedElection go={go} />;

  async function run(kind: AttackKind) {
    setBusy(kind);
    const report = await store.runAttack(kind);
    setReports((prev) => [report, ...prev]);
    setBusy(null);
    refresh();
  }

  return (
    <>
      <PageHead title="Attack lab">
        Play a dishonest voter. Some attacks are stopped at the door; the last two pass the per-ballot checks and are only caught when the tally is decrypted.
      </PageHead>
      <div className="sb-attacks" style={{ marginBottom: 22 }}>
        {ATTACKS.map((a) => (
          <div className="sb-attack" key={a.kind}>
            <b>{a.title}</b>
            <p>{a.blurb}</p>
            <button className="sb-btn" disabled={busy !== null} onClick={() => run(a.kind)}>
              {busy === a.kind ? 'Running…' : 'Run attack'}
            </button>
          </div>
        ))}
      </div>
      {reports.length === 0 ? (
        <div className="sb-empty"><p>Run an attack to see how the system responds.</p></div>
      ) : (
        <section className="sb-card">
          <h2>Results</h2>
          <ul className="sb-checks">
            {reports.map((r, i) => (
              <li key={i}>
                <span className={'sb-badge ' + (r.counted ? 'is-warn' : 'is-ok')}>{r.counted ? 'Stored' : 'Blocked'}</span>
                <div>{r.title}<small>{r.detail}</small></div>
              </li>
            ))}
          </ul>
          <div className="sb-actions" style={{ marginTop: 14 }}>
            <button className="sb-btn is-ghost" onClick={() => go('tally')}>Open the tally</button>
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ audit */

function AuditPage({ store, go }: PageProps) {
  const [filter, setFilter] = useState<'all' | AuditKind>('all');
  if (!store.config) return <NeedElection go={go} />;
  const rows = store.audit.filter((a) => filter === 'all' || a.kind === filter).slice().reverse();
  const FILTERS: { id: 'all' | AuditKind; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'info', label: 'Info' },
  ];
  const badge: Record<AuditKind, string> = { accepted: 'is-ok', rejected: 'is-bad', info: 'is-info' };

  return (
    <>
      <PageHead title="Audit log">Every ballot decision and tally run, newest first.</PageHead>
      <div className="sb-actions" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button key={f.id} className={'sb-btn is-small' + (filter === f.id ? '' : ' is-ghost')} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <section className="sb-card">
        {rows.length === 0 ? (
          <p>Nothing logged for this filter.</p>
        ) : (
          <div className="sb-table-wrap">
            <table className="sb-table">
              <thead><tr><th>Time</th><th>Type</th><th>Event</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="sb-mono">{a.time}</td>
                    <td><span className={'sb-badge ' + badge[a.kind]}>{a.kind}</span></td>
                    <td>{a.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------- math */

function MathPage({ store, go }: PageProps) {
  const [a, setA] = useState(17);
  const [b, setB] = useState(25);
  const [out, setOut] = useState<ReturnType<ElectionStore['demoAddition']> | null>(null);
  if (!store.config) return <NeedElection go={go} />;

  return (
    <>
      <PageHead title="Homomorphism">
        Paillier lets anyone multiply two ciphertexts to get an encryption of the sum. That is how votes are totalled without opening any ballot.
      </PageHead>
      <section className="sb-card">
        <div className="sb-row">
          <div className="sb-field">
            <label htmlFor="sb-a">First number</label>
            <input id="sb-a" type="number" min={0} max={999} value={a} onChange={(e) => setA(Number(e.target.value))} />
          </div>
          <div className="sb-field">
            <label htmlFor="sb-b">Second number</label>
            <input id="sb-b" type="number" min={0} max={999} value={b} onChange={(e) => setB(Number(e.target.value))} />
          </div>
        </div>
        <button className="sb-btn" onClick={() => setOut(store.demoAddition(Math.max(0, Math.floor(a)), Math.max(0, Math.floor(b))))}>
          Encrypt, multiply, decrypt
        </button>
      </section>
      {out && (
        <section className="sb-card sb-math">
          <div className="sb-math-step"><b>1. Encrypt {a}</b><div className="sb-cipher">{shortHex(out.ca, 56, 16)}</div></div>
          <div className="sb-math-step"><b>2. Encrypt {b}</b><div className="sb-cipher">{shortHex(out.cb, 56, 16)}</div></div>
          <div className="sb-math-step"><b>3. Multiply the two ciphertexts</b><div className="sb-cipher">{shortHex(out.product, 56, 16)}</div></div>
          <div className="sb-math-step">
            <b>4. Decrypt only the product</b>
            <span className="sb-badge is-ok">{out.sum.toString()}</span> equals {Math.floor(a)} + {Math.floor(b)}
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------- root */

export default function SecureBallotApp() {
  const [store] = useState(() => new ElectionStore());
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const [page, setPage] = useState<Page>('setup');
  const cfg = store.config;
  const props: PageProps = { store, refresh, go: setPage };

  return (
    <div className="sb-shell">
      <aside className="sb-rail">
        <div className="sb-brand">
          <span className="sb-seal" aria-hidden="true" />
          <div>
            <strong>Secure Ballot</strong>
            <small>Paillier voting demo</small>
          </div>
        </div>
        <nav aria-label="Sections">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={'sb-nav' + (page === item.id ? ' is-active' : '')}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => setPage(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </nav>
        <div className="sb-status">
          {cfg ? (
            <>
              <div><span className="sb-dot is-on" />{cfg.name}</div>
              <small>{store.ballots.length} of {cfg.maxVoters} ballots counted</small>
            </>
          ) : (
            <div><span className="sb-dot" />No election yet</div>
          )}
        </div>
      </aside>
      <main className="sb-main">
        {page === 'setup' && <SetupPage {...props} />}
        {page === 'vote' && <VotePage {...props} />}
        {page === 'tally' && <TallyPage {...props} />}
        {page === 'attacks' && <AttacksPage {...props} />}
        {page === 'audit' && <AuditPage {...props} />}
        {page === 'math' && <MathPage {...props} />}
      </main>
    </div>
  );
}
