import { supabase } from '../supabaseClient'

export async function loadCloudState(userId) {
  const { data, error } = await supabase
    .from('app_state')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { console.error('cloud load failed', error); return null }
  return data?.data || null
}

let saveTimer = null
export function saveCloudState(userId, state) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const { error } = await supabase
      .from('app_state')
      .upsert({ user_id: userId, data: state, updated_at: new Date().toISOString() })
    if (error) console.error('cloud save failed', error)
  }, 1200)
}