import { Db } from '../database/db';

export interface AuditEvent {
  id: number;
  electionId: number | null;
  type: string;
  detail: string;
  createdAt: string;
}

// Records security-relevant events. Never put a vote, a candidate choice or a token in `detail`.
export class AuditService {
  constructor(private readonly db: Db) {}

  record(electionId: number | null, type: string, detail = ''): void {
    this.db.prepare('INSERT INTO audit_events (election_id, type, detail) VALUES (?, ?, ?)').run(electionId, type, detail);
  }

  list(electionId: number): AuditEvent[] {
    const rows = this.db
      .prepare('SELECT id, election_id, type, detail, created_at FROM audit_events WHERE election_id = ? ORDER BY id')
      .all(electionId) as Array<{ id: number; election_id: number | null; type: string; detail: string; created_at: string }>;
    return rows.map((row) => ({
      id: row.id,
      electionId: row.election_id,
      type: row.type,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  }
}
