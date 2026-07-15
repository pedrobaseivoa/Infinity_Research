import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
    try {
        // Authenticate user
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const projectId = formData.get('projectId') as string;

        if (!file || !projectId) {
            return NextResponse.json({ error: 'Missing file or projectId' }, { status: 400 });
        }

        // Sanitize filename
        const sanitizedFilename = file.name
            .replace(/[()'"]/g, '')
            .replace(/[^\w\s.-]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_');

        // Generate storage path: {user_id}/{timestamp}-{filename}
        // This matches the existing convention in the bucket
        const timestamp = Date.now();
        const storageFilename = `${timestamp}-${sanitizedFilename}`;
        const storagePath = `${user.id}/${storageFilename}`;

        // Read file as buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to storage using authenticated client
        // Using upsert to allow overwriting if same file is uploaded
        const { error: uploadError } = await supabase.storage
            .from('article-pdfs')
            .upload(storagePath, buffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        // Create article record
        const { data: article, error: insertError } = await supabase
            .from('articles')
            .insert({
                project_id: projectId,
                pdf_filename: file.name,
                pdf_storage_path: storagePath,
                status: 'queued',
                queued_at: new Date().toISOString(),
                user_id: user.id
            })
            .select()
            .single();

        if (insertError) {
            console.error('Insert error:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        return NextResponse.json(article);
    } catch (err: any) {
        console.error('Upload error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
