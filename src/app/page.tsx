import { redirect } from 'next/navigation'

export default function Home() {
  // Single-user self-hosted mode: no login screen, go straight to the app.
  redirect('/dashboard')
}
