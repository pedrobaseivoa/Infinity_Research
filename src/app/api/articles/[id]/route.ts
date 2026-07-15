import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Get single article
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// DELETE - Delete article (with Demo protection)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    // 1. Get User/Session to check for Demo account
    // We need to parse the auth token from the request headers
    // But since we are using service role client, we can't trust just any header.
    // However, the standard way in Next.js + Supabase is usually creating a client from cookies.
    // Here we are using service_role for the DB, so we must manually check the user identity if possible,
    // OR rely on RLS if we used the user-scoped client.
    // Strategy: We will accept a 'userId' header or similar? No, that's insecure.
    // Better Strategy: Use RLS logic in the DB where possible, but here we want an explicit API error.

    // To properly protect, let's verify the user if we can.
    // For now, let's look at the implementation plan which said:
    // "Check: Get session user. If email == 'demonstration@infinity.com', return 403."

    // We'll trust the caller to send the Authorization header, validating it via Supabase.

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // DEMO PROTECTION
    if (user.email === 'infinity@research.user' || user.email === 'demonstration@infinity.com') {
         return NextResponse.json({ error: 'Deletion is disabled for this demonstration account.' }, { status: 403 });
    }

    const { data: article, error: fetchError } = await supabase
        .from('articles')
        .select('pdf_storage_path, status')
        .eq('id', id)
        .single();

    if (fetchError) {
        // If article not found, maybe already deleted?
        return NextResponse.json({ error: fetchError.message }, { status: 404 });
    }

    if (article?.status === 'processing') {
        await supabase.from('articles').update({ status: 'failed', error_message: 'Cancelled by user' }).eq('id', id);
    }

    // Delete from Storage
    if (article?.pdf_storage_path) {
        const { error: storageError } = await supabase
            .storage
            .from('article-pdfs')
            .remove([article.pdf_storage_path]);

        if (storageError) {
            console.error('Failed to delete file from storage:', storageError);
            // We continue to delete the record even if storage delete fails,
            // but logging it is important.
            // Ideally we might want to stop? No, better to remove the dangling DB reference.
        }
    }

    // 4. Delete Article from DB
    const { error: deleteError } = await supabase
        .from('articles')
        .delete()
        .eq('id', id);

    if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Article and PDF deleted successfully' });
}

// PATCH - Move article or update status
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();
    const { folder_id } = body;

    // Build update object
    const updateData: any = {};

    if (folder_id !== undefined) {
        updateData.folder_id = folder_id;
    }

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('articles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
