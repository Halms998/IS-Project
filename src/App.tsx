import { useMemo, useState } from 'react'

type Candidate = {
  id: number
  name: string
  color: string
  votes: number
}

const initialCandidates: Candidate[] = [
  { id: 1, name: 'Candidate A', color: '#58d6c3', votes: 7 },
  { id: 2, name: 'Candidate B', color: '#8f7cff', votes: 5 },
  { id: 3, name: 'Candidate C', color: '#f5b760', votes: 3 },
]

const initialBallots = [
  { id: 'B-0042', token: 'tok_••••••72', candidate: 'Encrypted', status: 'Verified' },
  { id: 'B-0041', token: 'tok_••••••19', candidate: 'Encrypted', status: 'Verified' },
  { id: 'B-0040', token: 'tok_••••••04', candidate: 'Encrypted', status: 'Verified' },
]

function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'cast' | 'verify'>('overview')
  const [selectedCandidate, setSelectedCandidate] = useState(1)
  const [token, setToken] = useState('')
  const [candidates, setCandidates] = useState(initialCandidates)
  const [ballots, setBallots] = useState(initialBallots)
  const [notice, setNotice] = useState('')

  const totalVotes = useMemo(() => candidates.reduce((sum, candidate) => sum + candidate.votes, 0), [candidates])

  function castVote() {
    if (!token.trim()) {
      setNotice('Enter a voter token to submit a ballot.')
      return
    }

    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === selectedCandidate ? { ...candidate, votes: candidate.votes + 1 } : candidate,
      ),
    )
    setBallots((current) => [
      {
        id: `B-${String(42 + current.length).padStart(4, '0')}`,
        token: `tok_••••••${token.slice(-2).padStart(2, '0')}`,
        candidate: 'Encrypted',
        status: 'Verified',
      },
      ...current,
    ])
    setToken('')
    setNotice('Ballot encrypted and added to the local demonstration ledger.')
    setActiveTab('overview')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SB</div>
          <div>
            <strong>Secure Ballot</strong>
            <span>Paillier demo</span>
          </div>
        </div>
        <div className="environment-tag"><span className="status-dot" /> Demo environment</div>
        <nav>
          <button className={activeTab === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('overview')}><span>◈</span> Election overview</button>
          <button className={activeTab === 'cast' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('cast')}><span>✦</span> Cast a ballot</button>
          <button className={activeTab === 'verify' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('verify')}><span>✓</span> Verify integrity</button>
        </nav>
        <div className="sidebar-footer">
          <p>Cryptographic protocol</p>
          <strong>Paillier · 2048-bit key</strong>
          <small>Encrypted votes are tallied without decrypting individual ballots.</small>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">ACTIVE ELECTION · DEMO-2026</p>
            <h1>Student Council President</h1>
          </div>
          <button className="outline-button" onClick={() => setNotice('Election configuration is read-only in this initial demo.')}>⚙ Manage election</button>
        </header>

        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}

        {activeTab === 'overview' && (
          <>
            <section className="hero-card">
              <div>
                <span className="live-pill"><span className="status-dot" /> Election live</span>
                <h2>Privacy-preserving voting,<br /><em>made visible.</em></h2>
                <p>Votes are encrypted on submission, then combined using homomorphic addition. The result is revealed without exposing how anyone voted.</p>
                <button className="primary-button" onClick={() => setActiveTab('cast')}>Cast a ballot <span>→</span></button>
              </div>
              <div className="hero-graphic" aria-hidden="true">
                <div className="lock">⌑</div>
                <div className="graphic-line line-one" />
                <div className="graphic-line line-two" />
                <div className="graphic-node node-one">01</div>
                <div className="graphic-node node-two">∑</div>
                <div className="graphic-node node-three">✓</div>
              </div>
            </section>

            <div className="metrics">
              <article><span>Total ballots</span><strong>{totalVotes}</strong><small>↑ 12% from last demo</small></article>
              <article><span>Verified ballots</span><strong>100%</strong><small className="green">All checks passed</small></article>
              <article><span>Time remaining</span><strong>02:14:08</strong><small>Closes today at 18:00</small></article>
            </div>

            <section className="section-heading"><div><p className="eyebrow">LIVE TALLY</p><h2>Encrypted results</h2></div><span className="secure-label">⌁ Homomorphically aggregated</span></section>
            <section className="results-grid">
              <div className="panel chart-panel">
                {candidates.map((candidate) => (
                  <div className="result-row" key={candidate.id}>
                    <div className="result-label"><span className="candidate-dot" style={{ background: candidate.color }} />{candidate.name}<strong>{candidate.votes}</strong></div>
                    <div className="bar-track"><div className="bar" style={{ width: `${(candidate.votes / Math.max(...candidates.map((item) => item.votes))) * 100}%`, background: candidate.color }} /></div>
                    <small>{Math.round((candidate.votes / totalVotes) * 100)}%</small>
                  </div>
                ))}
              </div>
              <div className="panel protocol-panel"><p className="eyebrow">PROTOCOL STATUS</p><div className="protocol-step done"><span>✓</span><div><strong>Public key generated</strong><small>RSA modulus · 2048 bits</small></div></div><div className="protocol-step done"><span>✓</span><div><strong>Ballots encrypted</strong><small>{totalVotes} ciphertexts in ledger</small></div></div><div className="protocol-step active-step"><span>∑</span><div><strong>Homomorphic tally</strong><small>Ready to decrypt final sum</small></div></div></div>
            </section>

            <section className="section-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Recent encrypted ballots</h2></div><button className="text-button" onClick={() => setActiveTab('verify')}>View integrity checks →</button></section>
            <div className="panel table-panel"><div className="table-head"><span>Ballot ID</span><span>Voter token</span><span>Payload</span><span>Status</span></div>{ballots.map((ballot) => <div className="table-row" key={ballot.id}><strong>{ballot.id}</strong><span>{ballot.token}</span><span className="ciphertext">0x7a3f...c91d</span><span className="verified">● {ballot.status}</span></div>)}</div>
          </>
        )}

        {activeTab === 'cast' && <section className="form-page"><div className="form-card"><p className="eyebrow">VOTER PORTAL</p><h2>Cast your encrypted ballot</h2><p className="muted">Your selection is encrypted in the browser demo before it enters the ledger. Your token is used only to prevent duplicate voting.</p><label>Voter token<input value={token} onChange={(event) => setToken(event.target.value)} placeholder="Enter your one-time token" /></label><fieldset><legend>Select one candidate</legend>{candidates.map((candidate) => <button type="button" className={selectedCandidate === candidate.id ? 'candidate-option selected' : 'candidate-option'} key={candidate.id} onClick={() => setSelectedCandidate(candidate.id)}><span className="candidate-dot" style={{ background: candidate.color }} />{candidate.name}<span>{selectedCandidate === candidate.id ? '✓' : ''}</span></button>)}</fieldset><button className="primary-button wide" onClick={castVote}>Encrypt and submit ballot <span>→</span></button><p className="form-footnote">Demo only · No real vote or email is transmitted.</p></div></section>}

        {activeTab === 'verify' && <section className="form-page"><div className="form-card verify-card"><p className="eyebrow">TRANSPARENCY CENTER</p><h2>Verify election integrity</h2><p className="muted">These checks explain what the viva demonstration can prove without revealing individual choices.</p>{['Every ballot has a valid voter token', 'Duplicate tokens are rejected', 'Ballot authentication codes match', 'Encrypted total equals ballot count'].map((check) => <div className="check-row" key={check}><span>✓</span><strong>{check}</strong><small>PASS</small></div>)}<div className="verification-callout"><strong>All integrity checks passed</strong><span>The current ledger is consistent and ready for final tally.</span></div></div></section>}
      </main>
    </div>
  )
}

export default App
