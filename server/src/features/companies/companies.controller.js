import * as companiesService from './companies.service.js';
import { rescoreUserInBackground } from '../matching/match.service.js';

const LIMIT_MESSAGE = `You can have at most ${companiesService.MAX_FAVORITES_PER_USER} favorite companies`;
const DUPLICATE_MESSAGE = 'You already have this company';

// `service` and `onFavoritesChanged` can be replaced in tests.
// onFavoritesChanged(userId) runs after a change that decides which jobs count as a favorite's (the user's jobs get
// scored again in the background; a favorite's jobs always get a Match row).
export function buildCompaniesController({ service = companiesService, onFavoritesChanged = rescoreUserInBackground } = {}) {
  return {
    async list(req, res) {
      res.json({ companies: await service.listFavorites(req.user.id) });
    },

    async create(req, res) {
      const result = await service.createFavorite(req.user.id, req.body);
      if (result.status === 'limit') return res.status(409).json({ error: LIMIT_MESSAGE });
      if (result.status === 'duplicate') return res.status(409).json({ error: DUPLICATE_MESSAGE });
      onFavoritesChanged(req.user.id);
      res.status(201).json({ company: result.company });
    },

    async update(req, res) {
      const result = await service.updateFavorite(req.user.id, req.validated.params.id, req.body);
      if (result.status === 'notfound') return res.status(404).json({ error: 'Company not found' });
      if (result.status === 'duplicate') return res.status(409).json({ error: DUPLICATE_MESSAGE });
      // only the name and the aliases decide which jobs belong to the company; a new career page link does not
      if (req.body.name !== undefined || req.body.aliases !== undefined) onFavoritesChanged(req.user.id);
      res.json({ company: result.company });
    },

    async remove(req, res) {
      const deleted = await service.deleteFavorite(req.user.id, req.validated.params.id);
      if (!deleted) return res.status(404).json({ error: 'Company not found' });
      onFavoritesChanged(req.user.id);
      res.json({ ok: true });
    },
  };
}
