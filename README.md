# Bills Computer

Local Pokémon TCG collection, deck, allocation, shopping, sync, and admin tool.

## Commands

```bash
npm install
npm run build
npm start
```

Development:

```bash
npm run dev
```

Checks:

```bash
npm run lint
npm test
```

Card sync:

```bash
npm run sync-cards
npm run sync-cards:force
```

## Data

SQLite database:

```text
data/cards.db
```

Do not delete the database unless you intend to rebuild local card, collection, deck, allocation, wishlist, and admin data.

## Docs

- [Deployment](docs/DEPLOYMENT.md)
- [Home Dashboard API](docs/HOME_DASHBOARD_API.md)
- [Bug Fix And Feature Plan](docs/BUG_FIX_AND_FEATURE_PLAN.md)

## Environment

Common `.env` values:

```env
APP_PASSWORD=your-password
DB_PATH=./data/cards.db
POKEMONTCG_API_KEY=optional-api-key
DASHBOARD_API_TOKEN=optional-dashboard-token
```
