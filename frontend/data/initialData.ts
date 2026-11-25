
import type { Candidate, Ballot } from '../types'

export const initialCandidates: Candidate[] = [
  { id: 1, name: 'Candidate A', color: '#58d6c3', votes: 7 },
  { id: 2, name: 'Candidate B', color: '#8f7cff', votes: 5 },
  { id: 3, name: 'Candidate C', color: '#f5b760', votes: 3 },
]

export const initialBallots: Ballot[] = [
  {
    id: 'B-0042',
    token: 'tok_••••••72',
    candidate: 'Encrypted',
    status: 'Verified',
  },
  {
    id: 'B-0041',
    token: 'tok_••••••19',
    candidate: 'Encrypted',
    status: 'Verified',
  },
  {
    id: 'B-0040',
    token: 'tok_••••••04',
    candidate: 'Encrypted',
    status: 'Verified',
  },
]
