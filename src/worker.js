const fs = require('fs');
const dayjs = require('dayjs');
const iconv = require('iconv-lite');
const { parse } = require('csv-parse/sync');
const { uploadQueue } = require('./queue');
const { run, initialize } = require('./db');

const sanitizeText = (buffer) => {
  const decoded = iconv.decode(buffer, 'utf8');
  return decoded.replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '');
};

const updateUpload = async (id, fields) => {
  const keys = Object.keys(fields);
  if (!keys.length) {
    return;
  }
  const assignments = keys.map((key) => `${key} = ?`).join(', ');
  const values = keys.map((key) => fields[key]);
  values.push(id);
  await run(
    `UPDATE uploads SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    values,
  );
};

const upsertProduct = async (record) => {
  const {
    uniqueKey,
    productTitle,
    productDescription,
    styleNumber,
    sanmarMainframeColor,
    size,
    colorName,
    piecePrice,
  } = record;

  await run(
    `
      INSERT INTO products (
        unique_key,
        product_title,
        product_description,
        style_number,
        sanmar_mainframe_color,
        size,
        color_name,
        piece_price,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(unique_key) DO UPDATE SET
        product_title = excluded.product_title,
        product_description = excluded.product_description,
        style_number = excluded.style_number,
        sanmar_mainframe_color = excluded.sanmar_mainframe_color,
        size = excluded.size,
        color_name = excluded.color_name,
        piece_price = excluded.piece_price,
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      uniqueKey,
      productTitle,
      productDescription,
      styleNumber,
      sanmarMainframeColor,
      size,
      colorName,
      piecePrice,
    ],
  );
};

const processJob = async (job) => {
  const { uploadId, filePath } = job.data;

  await updateUpload(uploadId, {
    status: 'processing',
    failure_reason: null,
  });

  try {
    const buffer = await fs.promises.readFile(filePath);
    const cleanedContent = sanitizeText(buffer);

    const rows = parse(cleanedContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const totalRows = rows.length;
    await updateUpload(uploadId, {
      total_rows: totalRows,
      processed_rows: 0,
    });

    let processed = 0;

    for (const row of rows) {
      const uniqueKey = (row.UNIQUE_KEY || '').toString().trim();
      if (!uniqueKey) {
        continue;
      }

      const productTitle = (row.PRODUCT_TITLE || '').toString().trim();
      const productDescription = (row.PRODUCT_DESCRIPTION || '').toString().trim();
      const styleNumber = (row['STYLE#'] || '').toString().trim();
      const sanmarMainframeColor = (row.SANMAR_MAINFRAME_COLOR || '').toString().trim();
      const size = (row.SIZE || '').toString().trim();
      const colorName = (row.COLOR_NAME || '').toString().trim();
      const piecePriceRaw = (row.PIECE_PRICE || '').toString().trim();
      const piecePrice = piecePriceRaw ? Number(piecePriceRaw.replace(/[^0-9.-]/g, '')) : null;

      await upsertProduct({
        uniqueKey,
        productTitle,
        productDescription,
        styleNumber,
        sanmarMainframeColor,
        size,
        colorName,
        piecePrice,
      });

      processed += 1;

      if (processed % 25 === 0) {
        await updateUpload(uploadId, { processed_rows: processed });
      }
    }

    await updateUpload(uploadId, {
      processed_rows: processed,
      status: 'completed',
      completed_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    });
  } catch (error) {
    await updateUpload(uploadId, {
      status: 'failed',
      failure_reason: error.message,
    });
    throw error;
  }
};

const start = async () => {
  await initialize();
  uploadQueue.process('process-csv', processJob);

  uploadQueue.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`Job ${job.id} failed:`, err);
  });

  uploadQueue.on('completed', (job) => {
    // eslint-disable-next-line no-console
    console.log(`Job ${job.id} completed`);
  });

  // eslint-disable-next-line no-console
  console.log('Worker listening for jobs');
};

if (require.main === module) {
  start();
}

module.exports = {
  processJob,
};

