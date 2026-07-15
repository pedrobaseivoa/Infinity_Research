import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import MetricsView from './metrics-view'

export default async function MetricsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: articles } = await supabase
        .from('articles')
        .select(`
            id, created_at, status, pdf_filename, total_cost, total_tokens, total_duration_ms,
            folder_id,
            phase1_cost, phase3_cost, phase4_cost, phase5_cost, phase6_cost,
            phase1_model, phase3_model, phase4_models, phase5_models, phase6_model,
            phase1_json, phase2_json, phase3_json, phase7_json
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    const { data: folders } = await supabase
        .from('folders')
        .select('id, name')
        .eq('user_id', user.id)
        .order('name')

    const { data: reviews } = await supabase
        .from('article_reviews')
        .select('*')

    return (
        <div className="min-h-screen bg-gray-950">
            <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
                            <ArrowLeftIcon className="w-5 h-5" />
                        </Link>
                        <h1 className="text-lg font-bold text-white">Metrics & Analytics</h1>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-6">
                <MetricsView articles={articles || []} folders={folders || []} reviews={reviews || []} />
            </main>
        </div>
    )
}
