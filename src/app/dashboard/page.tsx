import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ArticlesManager from '@/components/ArticlesManager'

interface DashboardPageProps {
    searchParams: Promise<{ folder?: string }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
    const params = await searchParams
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: articles } = await supabase
        .from('articles')
        .select(`
            id, created_at, status, pdf_filename, total_cost, total_tokens,
            current_phase, phase1_json, phase1_model, folder_id, phase7_json, pipeline_config
        `)
        .order('created_at', { ascending: false })
        .eq('user_id', user.id)

    const { data: folders } = await supabase
        .from('folders')
        .select('*')
        .order('created_at', { ascending: false })

    const { data: reviewData } = await supabase
        .from('article_reviews')
        .select('article_id, reviewer_name, finalized')

    const { data: userSettings } = await supabase
        .from('user_settings')
        .select('openrouter_api_key')
        .eq('user_id', user.id)
        .single()

    const hasValidApiKey = !!userSettings?.openrouter_api_key
    const isDemo = user.email === 'infinity@research.user'

    const totalArticles = articles?.length || 0
    const completedArticles = articles?.filter(a => a.status === 'completed').length || 0
    const totalCost = articles?.reduce((sum, a) => sum + (Number(a.total_cost) || 0), 0) || 0

    return (
        <div className="min-h-screen bg-gray-950">
            <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="px-8 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="text-blue-400 text-xl font-light select-none">&infin;</span>
                        <h1 className="text-lg font-bold text-white tracking-tight">Infinity Research</h1>
                        {isDemo && (
                            <span className="bg-blue-500/10 text-blue-400 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/20 uppercase tracking-wider font-medium">Demo</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {!isDemo && totalArticles > 0 && (
                            <div className="hidden sm:flex items-center gap-3 mr-4 text-xs text-gray-500">
                                <span>{completedArticles}/{totalArticles} articles</span>
                                <span className="text-gray-700">|</span>
                                <span>${totalCost.toFixed(2)} spent</span>
                            </div>
                        )}
                        <Link href="/metrics" className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">Metrics</Link>
                        <Link href="/settings" className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">Settings</Link>
                    </div>
                </div>
            </header>

            <main className="px-8 py-6">
                {isDemo && (
                    <div className="mb-5 bg-blue-500/5 border border-blue-500/20 rounded-lg px-4 py-3 flex items-center gap-3 text-blue-300 text-sm">
                        <span className="text-base">i</span>
                        <p>Upload is disabled for this account. Contact the administrator to create an account.</p>
                    </div>
                )}

                {!isDemo && !hasValidApiKey && (
                    <div className="mb-5 bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-amber-300">
                            <span className="text-base">!</span>
                            <div>
                                <p className="font-medium text-sm">Configure your API key to start processing</p>
                                <p className="text-xs text-amber-400/60">You need an OpenRouter API key to analyze articles.</p>
                            </div>
                        </div>
                        <Link href="/settings" className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors">
                            Go to Settings
                        </Link>
                    </div>
                )}

                <ArticlesManager
                    initialArticles={articles || []}
                    initialFolders={folders || []}
                    userId={user.id}
                    isDemo={isDemo}
                    initialFolderId={params.folder || null}
                    articleReviews={reviewData || []}
                />
            </main>
        </div>
    )
}
