import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCvPdf, looksLikePdf, CvParseError } from '../cvParser.js';
import { makePdf, SAMPLE_CV_LINES } from './makePdf.js';

test('reads the text of a PDF', async () => {
  const text = await parseCvPdf(makePdf(SAMPLE_CV_LINES));
  assert.match(text, /Senior Backend Engineer/);
  assert.match(text, /Node\.js/);
  assert.match(text, /Example University/);
});

test('looksLikePdf checks the file header, not the name', () => {
  assert.equal(looksLikePdf(Buffer.from('%PDF-1.4 ...')), true);
  assert.equal(looksLikePdf(Buffer.from('<html>not a pdf</html>')), false);
  assert.equal(looksLikePdf(Buffer.alloc(0)), false);
});

test('rejects a file that is not a PDF', async () => {
  await assert.rejects(parseCvPdf(Buffer.from('just some text, not a pdf')), (err) => {
    assert.ok(err instanceof CvParseError);
    assert.equal(err.status, 422);
    return true;
  });
});

test('rejects a PDF without readable text', async () => {
  await assert.rejects(parseCvPdf(makePdf(['Hi'])), CvParseError);
});

test('rejects a broken PDF', async () => {
  await assert.rejects(parseCvPdf(Buffer.from('%PDF-1.4\nthis is broken')), CvParseError);
});
