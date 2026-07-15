import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Suspense } from 'react'
import ArticleView from './article-view'

interface ArticlePageProps {
    params: Promise<{ id: string }>
}

export default async function ArticlePage({ params }: ArticlePageProps) {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: article, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !article) {
        notFound()
    }

    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">Loading...</div>}>
            <ArticleView initialArticle={article} />
        </Suspense>
    )
}
