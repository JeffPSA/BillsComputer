# Home Dashboard API

This is the small API surface for linking Bill's PC to a separate home dashboard.

## Authentication

Set one of these environment variables on the app server:

```bash
DASHBOARD_API_TOKEN=choose-a-long-random-secret
```

or:

```bash
HOME_DASHBOARD_API_TOKEN=choose-a-long-random-secret
```

Then send it as a bearer token:

```bash
Authorization: Bearer choose-a-long-random-secret
```

Logged-in app tokens also work, but the dashboard token is better for a separate dashboard because it survives browser logout and page refreshes.

## Read Weekly Summary

```bash
curl -H "Authorization: Bearer choose-a-long-random-secret" \
  "http://localhost:3000/api/dashboard/weekly-routine"
```

Optional custom window:

```bash
curl -H "Authorization: Bearer choose-a-long-random-secret" \
  "http://localhost:3000/api/dashboard/weekly-routine?days=7"
```

Response shape:

```json
{
  "success": true,
  "generatedAt": "2026-08-23T15:00:00.000Z",
  "window": {
    "days": 7,
    "since": "2026-08-16T15:00:00.000Z",
    "until": "2026-08-23T15:00:00.000Z"
  },
  "database": {
    "totalCards": 19977,
    "totalPrintings": 19977,
    "totalSets": 174,
    "totalCollectionItems": 120,
    "totalDecks": 4
  },
  "sevenDayCounts": {
    "recentSetReleases": 0,
    "recentSetMetadataUpdates": 0,
    "collectionItemsAdded": 3,
    "collectionQuantityAdded": 8,
    "acquisitionEntries": 2,
    "acquisitionQuantity": 5,
    "acquisitionTotalCost": 120,
    "decksUpdated": 1,
    "syncRanInWindow": true,
    "pendingFailedSets": 0
  },
  "sync": {
    "lastSyncTimestamp": "2026-08-23T14:00:00.000Z",
    "lastSyncedSetId": "sv10",
    "lastSyncedPage": 1,
    "lastSyncCompletedWithFailures": false,
    "pendingFailedSetIds": []
  },
  "routine": {
    "lastRunAt": "2026-08-23T14:00:00.000Z",
    "lastStatus": "completed",
    "lastStats": {}
  },
  "syncJob": {
    "running": false,
    "status": "completed"
  }
}
```

## Run Weekly Routine

This starts a safe new-set scan by default. It checks the Pokémon TCG API for sets missing locally and syncs card data for those new sets.

```bash
curl -X POST \
  -H "Authorization: Bearer choose-a-long-random-secret" \
  -H "Content-Type: application/json" \
  "http://localhost:3000/api/dashboard/weekly-routine/run"
```

If another sync is already running, the route returns the existing job instead of starting a duplicate.

Optional incremental mode:

```bash
curl -X POST \
  -H "Authorization: Bearer choose-a-long-random-secret" \
  -H "Content-Type: application/json" \
  -d "{\"mode\":\"incremental\"}" \
  "http://localhost:3000/api/dashboard/weekly-routine/run"
```

Use the read endpoint after triggering the routine to poll status.
