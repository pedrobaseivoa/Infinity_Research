import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
        .from('article_reviews')
        .select('*')
        .eq('article_id', id)
        .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { reviewer_name, overall_score, overall_notes, metadata_reviews, scientific_reviews, outcome_reviews, finalized } = body

    if (!reviewer_name) return NextResponse.json({ error: 'reviewer_name is required' }, { status: 400 })

    const payload = {
        overall_score, overall_notes,
        metadata_reviews: metadata_reviews || {},
        scientific_reviews: scientific_reviews || {},
        outcome_reviews: outcome_reviews || [],
        finalized: finalized || false,
        updated_at: new Date().toISOString(),
    }

    const { data: existing } = await supabase
        .from('article_reviews')
        .select('id, finalized')
        .eq('article_id', id)
        .eq('reviewer_name', reviewer_name)
        .single()

    if (existing) {
        if (existing.finalized && !finalized) {
            return NextResponse.json({ error: 'Review is finalized' }, { status: 403 })
        }
        const { data, error } = await supabase
            .from('article_reviews')
            .update(payload)
            .eq('id', existing.id)
            .select()
            .single()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data)
    }

    const { data, error } = await supabase
        .from('article_reviews')
        .insert({ article_id: id, reviewer_name, ...payload })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
}
