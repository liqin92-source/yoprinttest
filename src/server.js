const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const dayjs = require('dayjs');
const { port, uploadDir, tempDir } = require('./config');
const { initialize, run, all } = require('./db');
const { uploadQueue } = require('./queue');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const timestamp = dayjs().format('YYYYMMDDHHmmssSSS');
    const sanitizedOriginal = file.originalname.replace(/[^\w.-]/g, '_');
    cb(null, `${timestamp}_${sanitizedOriginal}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      cb(new Error('Only CSV files are supported'));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max
  },
});

app.post('/api/upload', upload.single('file'), async (req, res, next) => {
  let uploadId;
  let storedFilename;
  let temporaryPath;
  let finalPath;
  try {
    if (!req.file) {
      res.status(400).json({ error: 'File is required' });
      return;
    }

    const originalName = req.file.originalname;
    storedFilename = req.file.filename;
    temporaryPath = req.file.path;
    finalPath = path.join(uploadDir, storedFilename);

    await fs.promises.rename(temporaryPath, finalPath);

    const result = await run(
      `
        INSERT INTO uploads (original_filename, stored_filename, status, created_at, updated_at)
        VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [originalName, storedFilename],
    );

    uploadId = result.lastID;

    await uploadQueue.add('process-csv', {
      uploadId,
      filePath: finalPath,
      originalName,
    });

    res.json({ uploadId });
  } catch (error) {
    if (storedFilename) {
      const pathsToClean = [];
      if (temporaryPath) {
        pathsToClean.push(temporaryPath);
      }
      if (finalPath) {
        pathsToClean.push(finalPath);
      }
      await Promise.all(
        pathsToClean.map(async (p) => {
          try {
            await fs.promises.unlink(p);
          } catch (err) {
            if (err.code !== 'ENOENT') {
              // eslint-disable-next-line no-console
              console.warn(`Failed to remove temp file ${p}:`, err.message);
            }
          }
        }),
      );
    }

    if (typeof uploadId === 'number') {
      try {
        await run(
          `
            UPDATE uploads
            SET status = 'failed', failure_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          [error.message, uploadId],
        );
      } catch (updateErr) {
        // eslint-disable-next-line no-console
        console.error('Failed to mark upload as failed', updateErr);
      }
    }

    next(error);
  }
});

app.get('/api/uploads', async (req, res, next) => {
  try {
    const uploads = await all(
      `
        SELECT id, original_filename, status, total_rows, processed_rows, failure_reason, created_at, updated_at, completed_at
        FROM uploads
        ORDER BY id DESC
      `,
    );
    res.json({ uploads });
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: err.message || 'Unexpected error' });
});

const start = async () => {
  await initialize();

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${port}`);
  });
};

if (require.main === module) {
  start();
}

module.exports = app;

