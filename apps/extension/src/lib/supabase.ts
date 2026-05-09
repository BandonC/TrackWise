import { createClient } from '@supabase/supabase-js'
import { chromeLocalStorage } from './storage'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in extension env')
}

export const supabase = createClient(url, key, {
  auth: {
    storage: chromeLocalStorage,
    flowType: 'pkce',
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
})
