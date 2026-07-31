import { supabase, supabaseUrl, supabaseAnonKey } from '../supabaseClient'

const CACHE_KEY = 'acezella_cloud_cache_v1'
const SNAPSHOT_KEY = 'acezella_snapshots_v1'
const MAX_SNAPSHOTS = 10

// ── Keep a live copy of the access token in memory so the unload-time flush
// can build an authenticated request synchronously, without awaiting
// supabase.auth.getSession() (which is not guaranteed to resolve before the
// page actually unloads). ──────────────────────────────────────────────────
let cachedToken = null
supabase.auth.getSession().then(({ data: { session } }) => { cachedToken = session?.access_token || null })
supabase.auth.onAuthStateChange((_event, session) => { cachedToken = session?.access_token || null })

// ── Sync status pub/sub, so the UI can show Saving… / Saved / Offline / Blocked ──
const listeners = new Set()
function notify(status) { listeners.forEach(fn => fn(status)) }
export function onSyncStatusChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }

// A state counts as "real data" if it has anything a user would be upset to
// lose. This is the single source of truth for every wipe-guard below —
// keep it in sync if new top-level collections are ever added to state.
export function hasRealData(state) {
  if (!state) return false
  return (
    (state.trades?.length > 0) ||
    (state.accounts?.length > 0) ||
    (state.strategies?.length > 0) ||
    (state.propFirms?.length > 0) ||
    (state.payouts?.length > 0) ||
    (state.capitalTransactions?.length > 0) ||
    (state.expenses?.length > 0) ||
    (state.journalNotes && Object.keys(state.journalNotes).length > 0) ||
    (state.weeklyNotes && Object.keys(state.weeklyNotes).length > 0)
  )
}

// ── Rolling local snapshot history ──────────────────────────────────────────
// Independent of the "last cache" key below. Kept even across successful
// cloud saves, so an accidental wipe (a bug, a bad merge, a Supabase mishap)
// is always recoverable from something the user still has on their own
// machine, without depending on Supabase at all. Only real (non-empty)
// states are snapshotted — there's no point recovering "empty".
function pushSnapshot(userId, state) {
  if (!hasRealData(state)) return
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    const all = raw ? JSON.parse(raw) : {}
    const list = all[userId] || []
    list.push({ savedAt: Date.now(), state })
    while (list.length > MAX_SNAPSHOTS) list.shift()
    all[userId] = list
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(all))
  } catch (err) {
    console.error('snapshot save failed', err)
  }
}

// Returns snapshots newest-first: [{ savedAt, state }, ...]
export function getSnapshots(userId) {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return []
    const all = JSON.parse(raw)
    return (all[userId] || []).slice().reverse()
  } catch {
    return []
  }
}

// Returns one of:
//   { status: 'ok', data }        — row exists, here's the data
//   { status: 'not_found' }       — row genuinely does not exist (safe to treat as new account)
//   { status: 'error', error }    — request failed; caller must NOT assume anything about the data
export async function loadCloudState(userId) {
  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('cloud load failed', error)
      return { status: 'error', error }
    }
    if (!data?.data) return { status: 'not_found' }
    return { status: 'ok', data: data.data }
  } catch (err) {
    console.error('cloud load threw', err)
    return { status: 'error', error: err }
  }
}

let saveTimer = null
let pending = null      // { userId, state, options } queued but not yet sent
let inFlight = false    // a save request is currently in the air
const sessionHadData = {} // userId -> true once we've confirmed real data existed this session

async function doSave(userId, state) {
  inFlight = true
  notify('saving')
  try {
    const { error } = await supabase
      .from('app_state')
      .upsert({ user_id: userId, data: state, updated_at: new Date().toISOString() })
    if (error) throw error
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, state, savedAt: Date.now() }))
    pushSnapshot(userId, state)
    notify('saved')
  } catch (err) {
    console.error('cloud save failed', err)
    // Never lose the change: cache it locally, flagged as not-yet-synced,
    // so it can be retried and so a reload doesn't silently lose it.
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, state, savedAt: Date.now(), unsynced: true }))
    notify('error')
  } finally {
    inFlight = false
    if (pending) {
      const next = pending
      pending = null
      doSave(next.userId, next.state)
    }
  }
}

// Debounced save — call this on every state change. Safe to call rapidly;
// it coalesces bursts of dispatches into one request.
//
// THE CORE FIX: once we've seen real data for this account during this
// session, we refuse to save an empty state over it unless the caller
// explicitly passes { allowEmpty: true } — which should only ever be set
// for a deliberate, user-confirmed "Clear All Data" action. This is what
// stops any future bug (or edge case we haven't thought of) from silently
// overwriting real cloud data with a blank state.
export function saveCloudState(userId, state, options = {}) {
  if (hasRealData(state)) sessionHadData[userId] = true
  if (!hasRealData(state) && sessionHadData[userId] && !options.allowEmpty) {
    console.error(
      '[cloudSync] BLOCKED a save that would have wiped real data with an empty state. ' +
      'If this was intentional (e.g. the user chose "Clear All Data"), pass { allowEmpty: true }.'
    )
    notify('blocked')
    return
  }
  pending = { userId, state, options }
  notify('pending')
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (inFlight) return // doSave's finally-block will pick up `pending` when it completes
    const next = pending
    pending = null
    if (next) doSave(next.userId, next.state)
  }, 600)
}

// Best-effort, unload-safe flush. Call this from 'visibilitychange' (hidden)
// and 'pagehide' — NOT just 'beforeunload', which some browsers cut short.
// Same wipe-guard applies here.
export function flushCloudStateSync(userId, state, options = {}) {
  clearTimeout(saveTimer)
  const toSend = pending?.state || state
  const effectiveOptions = pending?.options || options
  pending = null
  if (!userId || !toSend) return
  if (!hasRealData(toSend) && sessionHadData[userId] && !effectiveOptions.allowEmpty) {
    console.error('[cloudSync] BLOCKED unload-flush that would have wiped real data with an empty state.')
    return
  }
  try {
    fetch(`${supabaseUrl}/rest/v1/app_state?on_conflict=user_id`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${cachedToken || supabaseAnonKey}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{ user_id: userId, data: toSend, updated_at: new Date().toISOString() }]),
    }).catch(() => {})
  } catch (err) {
    console.error('flush failed', err)
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, state: toSend, savedAt: Date.now() }))
  pushSnapshot(userId, toSend)
}

// Only used as an offline/failure fallback — never as the primary source.
export function getLocalCache(userId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.userId === userId ? parsed : null
  } catch {
    return null
  }
}
