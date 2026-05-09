import { signInWithGoogle } from './actions'

export default function LoginPage() {
  return (
    <main>
      <h1>TrackWise</h1>
      <form action={signInWithGoogle}>
        <button type="submit">Sign in with Google</button>
      </form>
    </main>
  )
}
