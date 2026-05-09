import { supabase } from '../lib/supabase'

const TEST_USER_ID = '54e04c52-c780-4d1e-9239-f94a7cfb02ce'

const btn = document.getElementById('save-btn') as HTMLButtonElement
const status = document.getElementById('status') as HTMLDivElement

btn.addEventListener('click', async () => {
  btn.disabled = true
  status.textContent = 'Saving...'

  const { error } = await supabase.from('applications').insert({
    user_id: TEST_USER_ID,
    company: 'Test Company',
    role: 'Test Engineer',
    source_site: 'manual',
    status: 'applied',
  })

  if (error) {
    status.textContent = `Error: ${error.message}`
  } else {
    status.textContent = 'Saved!'
  }

  btn.disabled = false
})
