import { Router } from 'express';
import { createElectionController } from '../controllers/electionController';
import { requireAdmin } from '../middleware/adminAuth';
import { AuditService } from '../services/auditService';
import { ElectionService } from '../services/electionService';

export function createRoutes(elections: ElectionService, audit: AuditService, adminApiKey: string): Router {
  const router = Router();
  const controller = createElectionController(elections, audit);
  const admin = requireAdmin(adminApiKey, audit);

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Admin only.
  router.post('/elections', admin, controller.create);
  router.post('/elections/:id/tally', admin, controller.tally);
  router.get('/elections/:id/audit', admin, controller.audit);

  // Public.
  router.get('/elections', controller.list);
  router.get('/elections/:id', controller.get);
  router.post('/elections/:id/ballots', controller.castBallot);
  router.get('/elections/:id/ballots', controller.listBallots);

  return router;
}
