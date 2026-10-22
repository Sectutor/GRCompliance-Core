import { Router } from 'express';

/**
 * The streaming generator is removed. The mount stays so anonymous callers
 * still receive 401 and no model is contacted.
 */
export const aiRouter = Router();

aiRouter.all('*', (_req, res) => {
    res.status(401).json({ error: 'Unauthorized' });
});
