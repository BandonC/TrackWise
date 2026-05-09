import { createClient } from '@/lib/supabase/server'

export default async function ApplicationsPage() {
  const supabase = await createClient()
  const { data: applications, error } = await supabase
    .from('applications')
    .select('id, company, role, status, applied_at')
    .order('applied_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (
    <main>
      <h1>Applications</h1>
      {applications.length === 0 ? (
        <p>No applications yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>Status</th>
              <th>Applied</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((app) => (
              <tr key={app.id}>
                <td>{app.company}</td>
                <td>{app.role}</td>
                <td>{app.status}</td>
                <td>{app.applied_at.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
