import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - List all projects with calculated stats
export async function GET() {
    // Get all projects
    const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

    if (projectsError) {
        return NextResponse.json({ error: projectsError.message }, { status: 500 });
    }

    // Get all articles to calculate stats
    const { data: articles, error: articlesError } = await supabase
        .from('articles')
        .select('project_id, status, total_cost');

    if (articlesError) {
        return NextResponse.json({ error: articlesError.message }, { status: 500 });
    }

    // Calculate stats for each project
    const projectsWithStats = projects.map(project => {
        const projectArticles = articles?.filter(a => a.project_id === project.id) || [];
        return {
            ...project,
            articles_count: projectArticles.length,
            completed_count: projectArticles.filter(a => a.status === 'completed').length,
            total_cost_usd: projectArticles.reduce((sum, a) => sum + (Number(a.total_cost) || 0), 0)
        };
    });

    return NextResponse.json(projectsWithStats);
}

// POST - Create new project
export async function POST(request: NextRequest) {
    const { name, description } = await request.json();

    if (!name?.trim()) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('projects')
        .insert({
            name: name.trim(),
            description: description?.trim() || null
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
