import path from 'node:path';
import * as cvService from './cv.service.js';
import { parseCvPdf } from './cvParser.js';
import { rescoreCvInBackground } from '../matching/match.service.js';

// Name from the form field "name", or the file name without ".pdf".
function resolveName(req) {
  const fromForm = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const fromFile = path.parse(path.basename(req.file.originalname || '')).name.trim();
  return (fromForm || fromFile || 'My CV').slice(0, 100);
}

export async function upload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Attach a PDF in the "file" field' });
  }

  // Check the limit first, so we do not read a PDF we will not keep.
  if (await cvService.isLimitReached(req.user.id)) {
    return res.status(409).json({ error: 'You already have a CV. Delete it first.' });
  }

  const text = await parseCvPdf(req.file.buffer);
  const result = await cvService.createCv(req.user.id, { text, name: resolveName(req) });

  if (result.status === 'limit') {
    return res.status(409).json({ error: 'You already have a CV. Delete it first.' });
  }
  rescoreCvInBackground(result.cv.id);
  res.status(201).json({ cv: result.cv });
}

export async function list(req, res) {
  res.json({ cvs: await cvService.listCvs(req.user.id) });
}

export async function update(req, res) {
  const cv = await cvService.updateCv(req.user.id, req.params.id, req.body);
  if (!cv) return res.status(404).json({ error: 'CV not found' });
  // A new name does not change any score; everything else does.
  if (Object.keys(req.body).some((key) => key !== 'name')) rescoreCvInBackground(cv.id);
  res.json({ cv });
}

export async function remove(req, res) {
  const deleted = await cvService.deleteCv(req.user.id, req.params.id);
  if (!deleted) return res.status(404).json({ error: 'CV not found' });
  res.json({ ok: true });
}
