const { initialize, run } = require('../src/db');

const main = async () => {
  await initialize();
  await run('DELETE FROM uploads');
  // eslint-disable-next-line no-console
  console.log('Cleared uploads history.');
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

