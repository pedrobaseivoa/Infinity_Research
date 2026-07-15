import { redirect } from 'next/navigation'

// Login is disabled in single-user self-hosted mode. The middleware signs the
// owner in automatically, so this route just forwards to the app.
export default function LoginPage() {
    redirect('/dashboard')
}
