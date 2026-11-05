import { PDFParse } from 'pdf-parse';

const MAX_TEXT_CHARS = 100_000;
const MIN_TEXT_CHARS = 50;

// status 422 so the error handler sends this message to the client (it is not a server bug)
export class CvParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CvParseError';
    this.status = 422;
  }
}

// A real PDF starts with "%PDF-". We do not trust the file name or the browser's mime type.
export function looksLikePdf(buffer) {
  return buffer.length > 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

function cleanText(raw) {
  return String(raw ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^-- \d+ of \d+ --$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// PDF file (Buffer) -> plain text. The file itself is never saved anywhere.
export async function parseCvPdf(buffer) {
  if (!looksLikePdf(buffer)) {
    throw new CvParseError('File is not a valid PDF');
  }

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = cleanText(result.text);

    if (text.length < MIN_TEXT_CHARS) {
      throw new CvParseError(
        'Could not read text from this PDF. Scanned or image-only PDFs are not supported.',
      );
    }
    return text.slice(0, MAX_TEXT_CHARS);
  } catch (err) {
    if (err instanceof CvParseError) throw err;
    throw new CvParseError('Could not read this PDF. It may be damaged or password protected.');
  } finally {
    await parser.destroy().catch(() => {});
  }
}
