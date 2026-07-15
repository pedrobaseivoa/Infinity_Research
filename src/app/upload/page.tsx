import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import UploadForm from './upload-form'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'

interface UploadPageProps {
    searchParams: Promise<{ folderId?: string; projectId?: string }>
}

export default async function UploadPage({ searchParams }: UploadPageProps) {
    const params = await searchParams
    const supabase = await createClient()

    let folderName: string | undefined
    if (params.folderId) {
        const { data: folder } = await supabase.from('folders').select('name').eq('id', params.folderId).single()
        folderName = folder?.name
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: settings } = await supabase.from('user_settings').select('openrouter_api_key').eq('user_id', user.id).single()
    const hasApiKey = !!settings?.openrouter_api_key
    const isDemo = user.email === 'infinity@research.user'

    return (
        <div className="min-h-screen bg-gray-950">
            <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
                    <h1 className="text-lg font-bold text-white">Upload</h1>
                    <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
                        <ArrowLeftIcon className="w-4 h-4" /> Dashboard
                    </Link>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-6 py-8">
                {isDemo ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500 text-sm mb-4">Upload is disabled for demo accounts.</p>
                        <Link href="/dashboard" className="text-blue-400 hover:underline text-sm">Back to Dashboard</Link>
                    </div>
                ) : !hasApiKey ? (
                    <div className="text-center py-12">
                        <p className="text-gray-400 text-sm mb-2">Configure your OpenRouter API key first.</p>
                        <Link href="/settings" className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors inline-block">Go to Settings</Link>
                    </div>
                ) : (
                    <UploadForm folderId={params.folderId} projectId={params.projectId} folderName={folderName} />
                )}
            </main>
        </div>
    )
}
