# Deployment Guide

This guide covers deploying the Pokémon TCG Deck Builder using SQLite database, both locally and with Docker.

## Database Architecture

The application now uses SQLite instead of JSON files for data storage. This provides:
- **Better performance** with indexed queries
- **ACID transactions** for data integrity
- **Docker compatibility** with single-file database
- **Easy backup/restore** with simple file operations

The SQLite database is located at `data/cards.db` by default.

## Local Development

### Initial Setup

1. **Initialize the database:**
   ```bash
   npm run init-db
   ```
   This creates the SQLite database with the proper schema and a default store profile. Existing `data/db.json` files are automatically archived to `data/db.json.archive`.

2. **Sync card data from the Pokémon TCG API:**
   ```bash
   npm run sync-cards
   ```
   This populates the database with card and set data. The initial sync may take several minutes depending on network speed.

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`

### Configuration

Environment variables can be set in a `.env` file:
```env
DATA_DIR=./data
DB_PATH=./data/cards.db
APP_PASSWORD=your_password_here
```

### Database Management

**Backup:**
```bash
cp data/cards.db data/cards.db.backup
```

**Restore:**
```bash
cp data/cards.db.backup data/cards.db
```

**View database contents:**
```bash
sqlite3 data/cards.db
.tables
.schema cards
SELECT * FROM cards LIMIT 10;
```

## Docker Deployment

### Prerequisites

- Docker installed on your system
- Docker Compose (if using docker-compose)

### Deployment Steps

1. **Build the Docker image:**
   ```bash
   docker-compose build
   ```

2. **Start the container:**
   ```bash
   docker-compose up -d
   ```
   The application will be available at `http://localhost:3000`

3. **Initialize the database (first time only):**
   ```bash
   docker-compose exec pokemon-tcg-deck-builder npm run init-db
   ```

4. **Sync card data (first time only):**
   ```bash
   docker-compose exec pokemon-tcg-deck-builder npm run sync-cards
   ```

### Volume Persistence

The SQLite database is persisted using a bind mount:
```yaml
volumes:
  - ./data:/app/data
```

This means:
- The `data/` directory on your host is mounted to `/app/data` in the container
- All database changes are persisted to your host filesystem
- You can backup/restore by simply copying the `data/cards.db` file

### Environment Variables

Create a `.env` file in the project root for Docker:
```env
APP_PASSWORD=your_secure_password
```

Additional environment variables are set in `docker-compose.yml`:
- `NODE_ENV=production`
- `DATA_DIR=/app/data`
- `DB_PATH=/app/data/cards.db`

### Docker Commands

**View logs:**
```bash
docker-compose logs -f
```

**Stop the container:**
```bash
docker-compose down
```

**Restart the container:**
```bash
docker-compose restart
```

**Access container shell:**
```bash
docker-compose exec pokemon-tcg-deck-builder sh
```

## Database Backup and Restore

### Local Development

**Backup:**
```bash
# Simple file copy
cp data/cards.db data/cards.db.backup.YYYYMMDD

# Or with timestamp
cp data/cards.db data/cards.db.backup.$(date +%Y%m%d_%H%M%S)
```

**Restore:**
```bash
cp data/cards.db.backup data/cards.db
```

### Docker Deployment

**Backup:**
```bash
# From host
cp data/cards.db data/cards.db.backup.YYYYMMDD

# Or from container
docker-compose exec pokemon-tcg-deck-builder cp /app/data/cards.db /app/data/cards.db.backup
```

**Restore:**
```bash
# From host
cp data/cards.db.backup data/cards.db

# Or from container
docker-compose exec pokemon-tcg-deck-builder cp /app/data/cards.db.backup /app/data/cards.db
```

## Troubleshooting

### Database Lock Issues

If you encounter database lock errors:
1. Ensure no other processes are accessing the database
2. Restart the application: `npm run dev` or `docker-compose restart`
3. Check for SQLite lock files: `data/cards.db-shm` and `data/cards.db-wal`
4. If necessary, delete the WAL files (ensure database is not in use)

### Docker Build Issues

If the Docker build fails due to native dependencies:
1. Ensure you're using the correct base image (Node.js 24 Alpine)
2. Check that build tools are installed in the Dockerfile
3. Try rebuilding without cache: `docker-compose build --no-cache`

### Card Sync Issues

If card sync fails:
1. Check your internet connection
2. Verify the Pokémon TCG API is accessible
3. Check the logs for specific error messages
4. Try running sync again: `npm run sync-cards`

### Performance Issues

If the application feels slow:
1. Check that SQLite indexes are created (automatic with schema)
2. Consider running `VACUUM` on the database to optimize: `sqlite3 data/cards.db VACUUM`
3. Check database size - it should be manageable (typically < 500MB for full sync)

## Migration from JSON to SQLite

The application now starts with a fresh SQLite database. If you have existing JSON data:

1. **Your JSON data is automatically archived** as `data/db.json.archive` when you run `npm run init-db`
2. **You can inspect the archived data** if needed
3. **The sync system uses canonical API IDs**, so legacy IDs may not work correctly
4. **Re-syncing from the API** is recommended for best results

If you need to manually migrate data, you would need to:
1. Parse the archived JSON file
2. Transform legacy IDs to canonical API IDs
3. Insert the data into SQLite using the database manager

## Monitoring

### Database Statistics

Check database health via the API:
```bash
curl http://localhost:3000/api/cards/sync-status
```

This returns:
- Total cards synced
- Total sets synced
- Last sync timestamp
- Sync progress information

### Application Logs

**Local:**
- Check console output when running `npm run dev`

**Docker:**
```bash
docker-compose logs -f pokemon-tcg-deck-builder
```

## Security Considerations

1. **Never commit the database file** to version control
2. **Set a strong APP_PASSWORD** in production
3. **Use environment variables** for sensitive configuration
4. **Regularly backup** the database file
5. **Limit Docker container permissions** in production
6. **Use HTTPS** in production deployments

## Scaling Considerations

SQLite is excellent for single-user and small-scale deployments. If you need to scale:

1. **Consider migrating to PostgreSQL** for better concurrent access
2. **Use connection pooling** for multiple users
3. **Implement read replicas** for high read traffic
4. **Consider cloud database services** for better reliability

The database manager abstraction makes migrating to PostgreSQL straightforward - you would only need to implement a new adapter for PostgreSQL.
