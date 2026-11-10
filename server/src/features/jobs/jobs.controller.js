import { listJobs } from './jobList.service.js';
import { getJob } from './jobDetail.service.js';

// `list` and `get` can be replaced in tests.
export function buildJobsController({ list = listJobs, get = getJob } = {}) {
  return {
    async list(req, res) {
      res.json(await list(req.user.id, req.validated.query));
    },

    async get(req, res) {
      const job = await get(req.user.id, req.validated.params.id);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      res.json({ job });
    },
  };
}
