import { listJobs } from './jobList.service.js';

// `list` can be replaced in tests.
export function buildJobsController({ list = listJobs } = {}) {
  return {
    async list(req, res) {
      res.json(await list(req.user.id, req.validated.query));
    },
  };
}
