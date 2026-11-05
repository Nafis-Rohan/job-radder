import multer from 'multer';

export const MAX_CV_BYTES = 2 * 1024 * 1024;

// memoryStorage: the PDF stays in RAM only and is never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CV_BYTES, files: 1, fields: 5 },
  fileFilter(req, file, callback) {
    if (file.mimetype !== 'application/pdf') {
      const error = new Error('Only PDF files are allowed');
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

// Form-data field name: "file". Upload problems become clean 4xx answers, not 500s.
export function uploadCvFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large (max 2 MB)' });
      }
      return res.status(400).json({ error: 'Invalid upload. Send one PDF in the "file" field.' });
    }
    next(err);
  });
}
