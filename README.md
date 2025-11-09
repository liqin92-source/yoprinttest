## Project Setup

Follow these steps after cloning the repository to get a working local environment.

1. Install PHP dependencies:
   ```
   composer install
   ```
2. Copy the environment template and generate an app key:
   ```
   cp .env.example .env  # use copy .env.example .env on Windows
   php artisan key:generate
   ```
3. The project ships with an empty SQLite database file at `database/database.sqlite`. If you need a fresh copy, recreate it with:
   ```
   php -r "touch('database/database.sqlite');"
   ```
4. Run the database migrations:
   ```
   php artisan migrate
   ```
5. Start any required workers or services. For the queue worker:
   ```
   php artisan queue:work --timeout=600 --tries=1
   ```

## Additional Notes

- Ensure your PHP version and extensions satisfy the requirements defined in `composer.json`.
- If you prefer another database, update the `.env` configuration accordingly before running migrations.
