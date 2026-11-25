
export interface Candidate {
  id: number
  name: string
  color: string
  votes: number
}

export interface Ballot {
  id: string
  token: string
  candidate: string
  status: 'Verified' | 'Pending' | 'Rejected'
}

export type ActiveTab = 'overview' | 'cast' | 'verify'
