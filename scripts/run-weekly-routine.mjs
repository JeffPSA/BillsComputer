#!/usr/bin/env node

const baseUrl = (process.env.BILLS_COMPUTER_URL || 'http://127.0.0.1:151').replace(/\/$/, '')
const token = process.env.DASHBOARD_API_TOKEN || process.env.HOME_DASHBOARD_API_TOKEN
const attempts = 3

if (!token) {
  console.error('[WeeklyRoutine] DASHBOARD_API_TOKEN is not configured')
  process.exit(2)
}

let lastError
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    const response = await fetch(`${baseUrl}/api/dashboard/weekly-routine/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(30_000),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${payload.error || 'request failed'}`)
    console.log(`[WeeklyRoutine] ${payload.alreadyRunning ? 'Routine already running' : 'Routine accepted'}${payload.syncJob?.runId ? ` (${payload.syncJob.runId})` : ''}`)
    process.exit(0)
  } catch (error) {
    lastError = error
    console.error(`[WeeklyRoutine] Attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 5000))
  }
}

console.error(`[WeeklyRoutine] Unable to start routine: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`)
process.exit(1)
