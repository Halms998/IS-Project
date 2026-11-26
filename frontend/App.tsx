
import { useEffect, useMemo, useState } from 'react'

type Candidate = {
  id: number
  name: string
  color: string
  votes: number
}

type Election = {
  id: number
  name: string
  candidates: string[]
  numVoters: number
  status: 'open' | 'tallied'
  createdAt: string
}

type ElectionSummary = Election & {
  tokensIssued: number
  tokensUsed: number
  ballotCount: number
}

type Ballot = {
  id: string
  token: string
  candidate: string
  status: string
  payload: string
}

type ApiBallot = {
  id: number
  ballot: string
  mac: string
  createdAt: string
}

const API = '/api'

const candidateColors = ['#58d6c3', '#8f7cff', '#f5b760', '#e879a9', '#70a5f5']

const initialCandidates: Candidate[] = [
  { id: 1, name: 'Candidate A', color: '#58d6c3', votes: 7 },
  { id: 2, name: 'Candidate B', color: '#8f7cff', votes: 5 },
  { id: 3, name: 'Candidate C', color: '#f5b760', votes: 3 },
]

const initialBallots: Ballot[] = [
  { id: 'B-0042', token: 'tok_******72', candidate: 'Encrypted', status: 'Verified', payload: '0x7a3f...c91d' },
  { id: 'B-0041', token: 'tok_******19', candidate: 'Encrypted', status: 'Verified', payload: '0x8b2a...f71c' },
  { id: 'B-0040', token: 'tok_******04', candidate: 'Encrypted', status: 'Verified', payload: '0x3d9e...a21b' },
]

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = data?.error?.message || `Request failed (${response.status})`
    throw new Error(message)
  }

  return data as T
}

async function loadElectionData(id: number) {
  const election = await apiRequest<ElectionSummary>(`/elections/${id}`)
  const response = await apiRequest<{ ballots: ApiBallot[] }>(`/elections/${id}/ballots`)

  const candidates: Candidate[] = election.candidates.map((name, index) => ({
    id: index + 1,
    name,
    color: candidateColors[index % candidateColors.length],
    votes: 0,
  }))

  const ballots: Ballot[] = response.ballots.map((ballot) => ({
    id: `B-${String(ballot.id).padStart(4, '0')}`,
    token: 'Not stored',
    candidate: 'Encrypted',
    status: 'Stored',
    payload: ballot.ballot.length > 18
      ? `${ballot.ballot.slice(0, 10)}...${ballot.ballot.slice(-6)}`
      : ballot.ballot,
  })).reverse()

  return { election, candidates, ballots }
}

function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'cast' | 'verify'>('overview')
  const [selectedCandidate, setSelectedCandidate] = useState(1)
  const [token, setToken] = useState('')
  const [candidates, setCandidates] = useState(initialCandidates)
  const [ballots, setBallots] = useState(initialBallots)
  const [notice, setNotice] = useState('')
  const [activeElection, setActiveElection] = useState<ElectionSummary | null>(null)
  const [apiStatus, setApiStatus] = useState<'checking' | 'live' | 'demo'>('checking')

  const totalVotes = useMemo(
    () => activeElection
      ? activeElection.ballotCount
      : candidates.reduce((sum, candidate) => sum + candidate.votes, 0),
    [activeElection, candidates],
  )

  useEffect(() => {
    let cancelled = false

    async function connectToApi() {
      try {
        await apiRequest<{ status: string }>('/health')

        const response = await apiRequest<{ elections: Election[] }>('/elections')

        if (cancelled) return

        if (response.elections.length === 0) {
          setApiStatus('demo')
          setNotice('API connected, but no election exists yet. Showing seeded demonstration data.')
          return
        }

        const latestElection = response.elections[response.elections.length - 1]
        const data = await loadElectionData(latestElection.id)

        if (cancelled) return

        setActiveElection(data.election)
        setCandidates(data.candidates)
        setBallots(data.ballots)
        setSelectedCandidate(1)
        setApiStatus('live')
      } catch (error) {
        if (cancelled) return

        setApiStatus('demo')
        setNotice(
          `Could not connect to the API. Showing seeded demo data. ${
            error instanceof Error ? error.message : ''
          }`,
        )
      }
    }

    connectToApi()

    return () => {
      cancelled = true
    }
  }, [])

  async function refreshLiveElection() {
    if (!activeElection) return

    const data = await loadElectionData(activeElection.id)
    setActiveElection(data.election)
    setCandidates(data.candidates)
    setBallots(data.ballots)
  }

  async function castVote() {
    if (!token.trim()) {
      setNotice('Enter a voter token to submit a ballot.')
      return
    }

    if (activeElection) {
      if (activeElection.status !== 'open') {
        setNotice('This election is closed. No further ballots can be submitted.')
        return
      }

      try {
        await apiRequest(`/elections/${activeElection.id}/ballots`, {
          method: 'POST',
          body: JSON.stringify({
            token: token.trim(),
            candidate: selectedCandidate,
          }),
        })

        setToken('')
        setNotice('Your encrypted ballot was successfully submitted and recorded.')

        try {
          await refreshLiveElection()
        } catch {
          setNotice('Your ballot was accepted, but the latest ballot list could not be refreshed.')
        }

        setActiveTab('overview')
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not submit your ballot.')
      }

      return
    }

    // Local-only behavior is retained for the seeded demonstration.
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === selectedCandidate
          ? { ...candidate, votes: candidate.votes + 1 }
          : candidate,
      ),
    )

    setBallots((current) => [
      {
        id: `B-${String(42 + current.length).padStart(4, '0')}`,
        token: `tok_******${token.slice(-2).padStart(2, '0')}`,
        candidate: 'Encrypted',
        status: 'Demo',
        payload: '0x7a3f...c91d',
      },
      ...current,
    ])

    setToken('')
    setNotice('Demo ballot added locally. No real vote was submitted.')
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

        <div className="environment-tag">
          <span className="status-dot" />
          {apiStatus === 'live'
            ? 'Live API'
            : apiStatus === 'checking'
              ? 'Connecting...'
              : 'Demo environment'}
        </div>

        <nav>
          <button className={activeTab === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('overview')}>
            <span>◈</span> Election overview
          </button>
          <button className={activeTab === 'cast' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('cast')}>
            <span>✦</span> Cast a ballot
          </button>
          <button className={activeTab === 'verify' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('verify')}>
            <span>✓</span> Verify integrity
          </button>
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
            <p className="eyebrow">
              {activeElection ? `ACTIVE ELECTION · #${activeElection.id}` : 'ACTIVE ELECTION · DEMO-2026'}
            </p>
            <h1>{activeElection?.name || 'Student Council President'}</h1>
          </div>
          <button
            className="outline-button"
            onClick={() => setNotice('Election configuration is managed through the protected admin API.')}
          >
            ⚙ Manage election
          </button>
        </header>

        {notice && (
          <div className="notice" role="status">
            {notice}
            <button onClick={() => setNotice('')}>×</button>
          </div>
        )}

        {activeTab === 'overview' && (
          <>
            <section className="hero-card">
              <div>
                <span className="live-pill">
                  <span className="status-dot" />
                  {activeElection?.status === 'tallied' ? 'Election completed' : 'Election live'}
                </span>
                <h2>Privacy-preserving voting,<br /><em>made visible.</em></h2>
                <p>
                  Votes are encrypted by the server on submission, then combined
                  using homomorphic addition. Individual choices remain private.
                </p>
                <button className="primary-button" onClick={() => setActiveTab('cast')}>
                  Cast a ballot <span>→</span>
                </button>
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
              <article>
                <span>{activeElection ? 'Recorded ballots' : 'Total ballots'}</span>
                <strong>{totalVotes}</strong>
                <small>{activeElection ? 'Stored by the API' : 'Seeded demo data'}</small>
              </article>

              <article>
                <span>{activeElection ? 'Voter tokens used' : 'Verified ballots'}</span>
                <strong>
                  {activeElection
                    ? `${activeElection.tokensUsed}/${activeElection.tokensIssued}`
                    : '100%'}
                </strong>
                <small className="green">
                  {activeElection ? 'Token usage' : 'Demo checks'}
                </small>
              </article>

              <article>
                <span>Election status</span>
                <strong>{activeElection?.status === 'tallied' ? 'Closed' : 'Open'}</strong>
                <small>{activeElection ? `Maximum ${activeElection.numVoters} voters` : 'Demo environment'}</small>
              </article>
            </div>

            <section className="section-heading">
              <div>
                <p className="eyebrow">LIVE TALLY</p>
                <h2>{activeElection ? 'Encrypted election results' : 'Encrypted results'}</h2>
              </div>
              <span className="secure-label">⌑ Homomorphically aggregated</span>
            </section>

            <section className="results-grid">
              <div className="panel chart-panel">
                {activeElection ? (
                  <div className="protocol-step">
                    <span>∑</span>
                    <div>
                      <strong>
                        {activeElection.status === 'tallied'
                          ? 'Election has been tallied'
                          : 'Individual results are not exposed'}
                      </strong>
                      <small>
                        {activeElection.status === 'tallied'
                          ? 'The final tally is returned only by the protected admin operation.'
                          : 'Candidate totals are not available until an authorized administrator runs the final tally.'}
                      </small>
                    </div>
                  </div>
                ) : (
                  candidates.map((candidate) => (
                    <div className="result-row" key={candidate.id}>
                      <div className="result-label">
                        <span className="candidate-dot" style={{ background: candidate.color }} />
                        {candidate.name}
                        <strong>{candidate.votes}</strong>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar"
                          style={{
                            width: `${(candidate.votes / Math.max(1, ...candidates.map((item) => item.votes))) * 100}%`,
                            background: candidate.color,
                          }}
                        />
                      </div>
                      <small>{Math.round((candidate.votes / Math.max(1, totalVotes)) * 100)}%</small>
                    </div>
                  ))
                )}
              </div>

              <div className="panel protocol-panel">
                <p className="eyebrow">PROTOCOL STATUS</p>
                <div className="protocol-step done">
                  <span>✓</span>
                  <div>
                    <strong>Public key generated</strong>
                    <small>Paillier cryptographic setup</small>
                  </div>
                </div>
                <div className="protocol-step done">
                  <span>✓</span>
                  <div>
                    <strong>Ballots encrypted</strong>
                    <small>{totalVotes} recorded ballots</small>
                  </div>
                </div>
                <div className="protocol-step active-step">
                  <span>∑</span>
                  <div>
                    <strong>Homomorphic tally</strong>
                    <small>
                      {activeElection?.status === 'tallied'
                        ? 'Tally completed'
                        : 'Awaiting authorized tally'}
                    </small>
                  </div>
                </div>
              </div>
            </section>

            <section className="section-heading">
              <div>
                <p className="eyebrow">AUDIT TRAIL</p>
                <h2>Recent encrypted ballots</h2>
              </div>
              <button className="text-button" onClick={() => setActiveTab('verify')}>
                View integrity checks →
              </button>
            </section>

            <div className="panel table-panel">
              <div className="table-head">
                <span>Ballot ID</span>
                <span>Voter token</span>
                <span>Payload</span>
                <span>Status</span>
              </div>
              {ballots.map((ballot) => (
                <div className="table-row" key={ballot.id}>
                  <strong>{ballot.id}</strong>
                  <span>{ballot.token}</span>
                  <span className="ciphertext">{ballot.payload}</span>
                  <span className="verified">● {ballot.status}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === 'cast' && (
          <section className="form-page">
            <div className="form-card">
              <p className="eyebrow">VOTER PORTAL</p>
              <h2>Cast your encrypted ballot</h2>
              <p className="muted">
                Your selection is sent securely to the server, where the
                cryptographic tools encrypt the ballot. Your token prevents duplicate voting.
              </p>

              <label>
                Voter token
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Enter your one-time token"
                />
              </label>

              <fieldset>
                <legend>Select one candidate</legend>
                {candidates.map((candidate) => (
                  <button
                    type="button"
                    className={selectedCandidate === candidate.id ? 'candidate-option selected' : 'candidate-option'}
                    key={candidate.id}
                    onClick={() => setSelectedCandidate(candidate.id)}
                  >
                    <span className="candidate-dot" style={{ background: candidate.color }} />
                    {candidate.name}
                    <span>{selectedCandidate === candidate.id ? '✓' : ''}</span>
                  </button>
                ))}
              </fieldset>

              <button
                className="primary-button wide"
                onClick={castVote}
                disabled={Boolean(activeElection && activeElection.status !== 'open')}
              >
                Encrypt and submit ballot <span>→</span>
              </button>

              <p className="form-footnote">
                {activeElection
                  ? 'Connected to the election API.'
                  : 'Demo only · No real vote is transmitted.'}
              </p>
            </div>
          </section>
        )}

        {activeTab === 'verify' && (
          <section className="form-page">
            <div className="form-card verify-card">
              <p className="eyebrow">TRANSPARENCY CENTER</p>
              <h2>Verify election integrity</h2>
              <p className="muted">
                These checks explain what the demonstration can prove without
                revealing individual choices.
              </p>

              {[
                'Every ballot has a valid voter token',
                'Duplicate tokens are rejected',
                'Ballot authentication codes match',
                'Encrypted total equals ballot count',
              ].map((check) => (
                <div className="check-row" key={check}>
                  <span>✓</span>
                  <strong>{check}</strong>
                  <small>{activeElection ? 'SERVER CHECK' : 'DEMO'}</small>
                </div>
              ))}

              <div className="verification-callout">
                <strong>
                  {activeElection ? 'Server-side verification' : 'Demo integrity checks'}
                </strong>
                <span>
                  {activeElection
                    ? 'Actual cryptographic verification is performed during the authorized tally operation.'
                    : 'These are demonstration indicators, not independent cryptographic verification.'}
                </span>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
