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
    "lastSuccessfulRunAt": "2026-08-23T14:00:00.000Z",
    "lastStatus": "completed",
    "lastStats": {
      "newSets": 0,
      "setsAttempted": 0,
      "setsCompleted": 0,
      "failedSetIds": []
    },
    "currentRun": {
      "runId": "8b37f6b9-13a8-4fc8-92bc-e9bed4c696fb",
      "running": false,
      "startedAt": "2026-08-23T13:59:55.000Z",
      "finishedAt": "2026-08-23T14:00:00.000Z",
      "status": "completed"
    },
    "ranInWindow": true
  },
  "syncJob": {
    "running": false,
    "status": "completed"
  }
}
```

## Run Weekly Routine

This starts a safe weekly routine. It checks the Pokémon TCG API for sets missing locally and syncs card data for the deduplicated union of new sets and sets in the persisted failed-set queue. A run with no work is still a successful completed weekly check. Discovery failures are reported as failed; remaining per-set failures are reported as partial.

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

The summary distinguishes actual data synchronization from routine execution:

- `sync.lastSyncTimestamp` advances only when set/card data is written.
- `routine.lastRunAt` is the finish time of every completed attempt.
- `routine.lastSuccessfulRunAt` advances only after a fully successful routine.
- `routine.ranInWindow` reports whether the weekly routine itself finished inside the requested window.
- `routine.currentRun` persists the latest run ID, timestamps, status, statistics, and sanitized failure detail across restarts.

Terminal statuses are `completed`, `partial`, `failed`, or `stopped`. A persisted running job found during startup is marked failed because it was interrupted by the restart.

## Weekly systemd timer

Templates live under `ops/systemd`. Install them only after creating `/etc/bills-computer-weekly.env` with mode `0600`:

```text
BILLS_COMPUTER_URL=http://127.0.0.1:151
DASHBOARD_API_TOKEN=your-dashboard-token
```

Copy the service and timer to `/etc/systemd/system`, run `systemctl daemon-reload`, and enable `bills-pokemon-weekly.timer`. It runs every Sunday at 03:00 Africa/Johannesburg with `Persistent=true`; the helper makes three bounded attempts and treats an already-running routine as success.
