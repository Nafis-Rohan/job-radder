import * as companiesService from './companies.service.js';

const LIMIT_MESSAGE = `You can have at most ${companiesService.MAX_FAVORITES_PER_USER} favorite companies`;
const DUPLICATE_MESSAGE = 'You already have this company';

// `service` can be replaced in tests.
export function buildCompaniesController({ service = companiesService } = {}) {
  return {
    async list(req, res) {
      res.json({ companies: await service.listFavorites(req.user.id) });
    },

    async create(req, res) {
      const result = await service.createFavorite(req.user.id, req.body);
      if (result.status === 'limit') return res.status(409).json({ error: LIMIT_MESSAGE });
      if (result.status === 'duplicate') return res.status(409).json({ error: DUPLICATE_MESSAGE });
      res.status(201).json({ company: result.company });
    },

    async update(req, res) {
      const result = await service.updateFavorite(req.user.id, req.validated.params.id, req.body);
      if (result.status === 'notfound') return res.status(404).json({ error: 'Company not found' });
      if (result.status === 'duplicate') return res.status(409).json({ error: DUPLICATE_MESSAGE });
      res.json({ company: result.company });
    },

    async remove(req, res) {
      const deleted = await service.deleteFavorite(req.user.id, req.validated.params.id);
      if (!deleted) return res.status(404).json({ error: 'Company not found' });
      res.json({ ok: true });
    },
  };
}
