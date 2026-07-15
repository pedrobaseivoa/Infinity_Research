import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SettingsForm from './settings-form'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'

export default async function SettingsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: settings } = await supabase.from('user_settings').select('*').eq('user_id', user.id).single()
    const isDemo = user.email === 'infinity@research.user'

    return (
        <div className="min-h-screen bg-gray-950">
            <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
                    <h1 className="text-lg font-bold text-white">Settings</h1>
                    <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
                        <ArrowLeftIcon className="w-4 h-4" /> Dashboard
                    </Link>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-6 py-8">
                {isDemo ? (
                    <div className="text-center py-12 text-gray-500 text-sm">
                        Settings are disabled for demo accounts.
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-sm font-semibold text-white mb-1">API Keys</h2>
                            <p className="text-xs text-gray-500">Bring your own keys. Stored in your own Supabase database, protected by row-level security, and only used server-side for your requests.</p>
                        </div>
                        <SettingsForm
                            initialSettings={{
                                openrouter_api_key: settings?.openrouter_api_key || '',
                                semantic_scholar_api_key: settings?.semantic_scholar_api_key || '',
                                openalex_api_key: settings?.openalex_api_key || '',
                                core_api_key: settings?.core_api_key || '',
                            }}
                        />
                    </div>
                )}
            </main>
        </div>
    )
}
