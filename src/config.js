const path = require('path');
const fs = require('fs');

require('dotenv').config();

const rootDir = path.resolve(__dirname, '..');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const uploadDir = path.join(rootDir, 'uploads');
const tempDir = path.join(rootDir, 'temp');
const dataDir = path.join(rootDir, 'data');

ensureDir(uploadDir);
ensureDir(tempDir);
ensureDir(dataDir);

module.exports = {
  port: process.env.PORT || 3000,
  databasePath: path.join(dataDir, 'app.sqlite'),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  uploadDir,
  tempDir,
};

