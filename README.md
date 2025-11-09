# CSV Upload Processing App

This project fulfills the requirements for an upload dashboard that:

- Accepts CSV uploads through a web UI.
- Stores upload metadata and rows in SQLite.
- Processes uploads in the background using a Redis-backed queue.
- Upserts product rows by `UNIQUE_KEY`, keeping the operation idempotent.
- Refreshes upload status in real time from the browser via polling.

## Prerequisites

- Node.js 16.x (project was created on 16.20.2)
- Redis server (local or remote)
- npm

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Copy environment template**

   ```bash
   cp env.sample .env
   ```

   Adjust values as needed (e.g., `REDIS_URL`).

3. **Start services**

   Terminal 1 – web server:

   ```bash
   npm run dev
   ```

   Terminal 2 – background worker:

   ```bash
   npm run worker
   ```

   Both commands will create the SQLite database (`data/app.sqlite`) on first run.

4. **Open the UI**

   Visit [http://localhost:3000](http://localhost:3000) and use the “Choose File” button or drag & drop a CSV.

## CSV Processing Details

- Files are queued immediately after upload and processed asynchronously.
- During processing:
  - Rows are sanitized to remove non UTF-8 characters.
  - Only the required columns are extracted:
    - `UNIQUE_KEY`
    - `PRODUCT_TITLE`
    - `PRODUCT_DESCRIPTION`
    - `STYLE#`
    - `SANMAR_MAINFRAME_COLOR`
    - `SIZE`
    - `COLOR_NAME`
    - `PIECE_PRICE`
  - Each row is **upserted** using `UNIQUE_KEY` as the primary key.
- The uploads table tracks status (`pending`, `processing`, `completed`, `failed`), total rows, processed rows, timestamps, and an error message if applicable.

## Testing with Provided Files

1. Upload `yoprint_test_import.csv` to seed the database.
2. Upload `yoprint_test_updated.csv` to confirm that updates are applied to existing records instead of duplicating them.

The history table on the UI will show the processing progress and outcome for each upload.

## Project Structure

```
src/
  config.js        // runtime configuration
  db.js            // SQLite helpers and schema creation
  queue.js         // Bull queue setup
  server.js        // Express HTTP API and static UI hosting
  worker.js        // Background job processor
public/
  index.html       // Upload dashboard
uploads/           // Stored CSV files
data/app.sqlite    // SQLite database (created at runtime)
```

## Development Notes

- The UI polls `/api/uploads` every 5 seconds for near real-time updates.
- Job retries are disabled by default; failures are surfaced on the upload history and logs.
- Logs are written to stdout/stderr. Adjust as needed for production environments.

## Possible Enhancements

- Add authentication for multi-tenant environments.
- Replace polling with WebSockets or Server-Sent Events.
- Expose an API endpoint for processed product data.
- Containerize the stack for easier deployment.

