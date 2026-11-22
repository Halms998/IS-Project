import { Request, Response } from 'express';
import { AuditService } from '../services/auditService';
import { ElectionService } from '../services/electionService';
import { ApiError } from '../types';

function parseId(raw: string | string[] | undefined): number {
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (!text || !/^[1-9][0-9]{0,9}$/.test(text)) {
    throw new ApiError(404, 'ELECTION_NOT_FOUND', 'No election with that id exists.');
  }
  return Number(text);
}

function bodyOf(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ApiError(400, 'INVALID_BODY', 'The request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

export function createElectionController(elections: ElectionService, audit: AuditService) {
  return {
    create: async (req: Request, res: Response): Promise<void> => {
      const body = bodyOf(req);
      const created = await elections.createElection({ name: body.name, candidates: body.candidates, numVoters: body.numVoters });
      // The tokens are shown only now. Hand each voter exactly one and keep the list secret.
      res.status(201).json(created);
    },
    list: (_req: Request, res: Response): void => {
      res.json({ elections: elections.listElections() });
    },
    get: (req: Request, res: Response): void => {
      res.json(elections.getElection(parseId(req.params.id)));
    },
    castBallot: async (req: Request, res: Response): Promise<void> => {
      const body = bodyOf(req);
      const saved = await elections.castBallot(parseId(req.params.id), { token: body.token, candidate: body.candidate });
      res.status(201).json(saved);
    },
    listBallots: (req: Request, res: Response): void => {
      res.json({ ballots: elections.listBallots(parseId(req.params.id)) });
    },
    tally: async (req: Request, res: Response): Promise<void> => {
      res.json(await elections.tally(parseId(req.params.id)));
    },
    audit: (req: Request, res: Response): void => {
      const id = parseId(req.params.id);
      elections.getElection(id);
      res.json({ events: audit.list(id) });
    },
  };
}
