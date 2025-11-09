const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');
const iconv = require('iconv-lite');
const { parse } = require('csv-parse/sync');
const { initialize, run, get, all } = require('../src/db');

const sanitizeText = (buffer) => {
  const decoded = iconv.decode(buffer, 'utf8');
  return decoded.replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '');
};

const upsertProduct = async (row) => {
  const uniqueKey = (row.UNIQUE_KEY || '').toString().trim();
  if (!uniqueKey) {
    return false;
  }

  const productTitle = (row.PRODUCT_TITLE || '').toString().trim();
  const productDescription = (row.PRODUCT_DESCRIPTION || '').toString().trim();
  const styleNumber = (row['STYLE#'] || '').toString().trim();
  const sanmarMainframeColor = (row.SANMAR_MAINFRAME_COLOR || '').toString().trim();
  const size = (row.SIZE || '').toString().trim();
  const colorName = (row.COLOR_NAME || '').toString().trim();
  const piecePriceRaw = (row.PIECE_PRICE || '').toString().trim();
  const piecePrice = piecePriceRaw ? Number(piecePriceRaw.replace(/[^0-9.-]/g, '')) : null;

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

  return true;
};

const main = async () => {
  const [storedFilename, originalNameArg] = process.argv.slice(2);

  if (!storedFilename) {
    // eslint-disable-next-line no-console
    console.error('Usage: node scripts/manual-import-test.js <storedFilename> [originalName]');
    process.exit(1);
  }

  await initialize();

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const filePath = path.join(uploadsDir, storedFilename);

  if (!fs.existsSync(filePath)) {
    // eslint-disable-next-line no-console
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const originalName = originalNameArg || storedFilename.replace(/^[0-9]+_/, '');

  const insertResult = await run(
    `
      INSERT INTO uploads (original_filename, stored_filename, status, created_at, updated_at)
      VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [originalName, storedFilename],
  );

  const uploadId = insertResult.lastID;

  const buffer = await fs.promises.readFile(filePath);
  const cleaned = sanitizeText(buffer);

  const rows = parse(cleaned, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  await run(
    `
      UPDATE uploads
      SET status = 'processing', total_rows = ?, processed_rows = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [rows.length, uploadId],
  );

  let processed = 0;
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await upsertProduct(row);
    if (ok) {
      processed += 1;
    }

    if (processed % 25 === 0) {
      // eslint-disable-next-line no-await-in-loop
      await run(
        `
          UPDATE uploads
          SET processed_rows = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [processed, uploadId],
      );
    }
  }

  await run(
    `
      UPDATE uploads
      SET processed_rows = ?, status = 'completed', completed_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [processed, dayjs().format('YYYY-MM-DD HH:mm:ss'), uploadId],
  );

  const uploadRow = await get(
    `
      SELECT id, original_filename, status, total_rows, processed_rows, failure_reason
      FROM uploads
      WHERE id = ?
    `,
    [uploadId],
  );

  const productCount = await get(
    `
      SELECT COUNT(*) as count FROM products
    `,
  );

  const sampleRows = await all(
    `
      SELECT unique_key, piece_price
      FROM products
      ORDER BY unique_key
      LIMIT 5
    `,
  );

  // eslint-disable-next-line no-console
  console.log('Upload summary:', uploadRow);
  // eslint-disable-next-line no-console
  console.log('Total products:', productCount.count);
  // eslint-disable-next-line no-console
  console.log('Sample products:', sampleRows);
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Test run failed:', error);
  process.exit(1);
});

