import { supabase, supabaseUrl, supabaseAnonKey } from '../supabaseClient'

const CACHE_KEY = 'acezella_cloud_cache_v1'

// ── Keep a live copy of the access token in memory so the unload-time flush
// can build an authenticated request synchronously, without awaiting
// supabase.auth.getSession() (which is not guaranteed to resolve before the
// page actually unloads). ──────────────────────────────────────────────────
let cachedToken = null
supabase.auth.getSession().then(({ data: { session } }) => { cachedToken = session?.access_token || null })
supabase.auth.onAuthStateChange((_event, session) => { cachedToken = session?.access_token || null })

// ── Sync status pub/sub, so the UI can show Saving… / Saved / Offline ──────
const listeners = new Set()
function notify(status) { listeners.forEach(fn => fn(status)) }
export function onSyncStatusChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export async function loadCloudState(userId) {
  const { data, error } = await supabase
    .from('app_state')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('cloud load failed', error)
    return null
  }
  return data?.data || null
}

let saveTimer = null
let pending = null      // { userId, state } queued but not yet sent
let inFlight = false    // a save request is currently in the air

async function doSave(userId, state) {
  inFlight = true
  notify('saving')
  try {
    const { error } = await supabase
      .from('app_state')
      .upsert({ user_id: userId, data: state, updated_at: new Date().toISOString() })
    if (error) throw error
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, state, savedAt: Date.now() }))
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
export function saveCloudState(userId, state) {
  pending = { userId, state }
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
// Uses a raw keepalive fetch instead of the supabase-js client because
// ordinary fetches queued during page teardown are not guaranteed to
// complete; `keepalive: true` is purpose-built for exactly this.
export function flushCloudStateSync(userId, state) {
  clearTimeout(saveTimer)
  const toSend = pending?.state || state
  pending = null
  if (!userId || !toSend) return
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
