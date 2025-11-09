const Bull = require('bull');
const { redisUrl } = require('./config');

const uploadQueue = new Bull('csv-processing', redisUrl, {
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: false,
  },
});

module.exports = {
  uploadQueue,
};

