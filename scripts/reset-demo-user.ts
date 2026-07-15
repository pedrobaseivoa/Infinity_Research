
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables manually to avoid installing dotenv
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');

const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function resetDemoUser() {
    const email = 'infinity@research.user';
    const password = 'demonstration';

    console.log(`Checking for user: ${email}...`);

    // 1. Check if user exists (by listing, or just try to get by email if possible methods exist,
    // but admin.listUsers is safer or strictly creating/updating)

    // Simplest approach: Try to create. If fails (already exists), then update.

    try {
        // Prepare user metadata
        const userMetadata = {
            full_name: 'Infinity Research Demo',
            role: 'admin' // or whatever app role is needed
        };

        // Try to create first
        const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: userMetadata
        });

        if (createError) {
            // If error is "User already registered", then update
            if (createError.message.includes('already registered') || createError.status === 422 || createError.status === 400) {
                 console.log('User already exists. Updating password...');

                 // We need the User ID to update. Get it by list or if createUser returned it?
                 // Usually createUser fails without data if dup.

                 // List users to find ID
                 const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
                 if (listError) throw listError;

                 const existingUser = users.find(u => u.email === email);
                 if (!existingUser) {
                     throw new Error('Could not find existing user even though create failed?');
                 }

                 const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
                     existingUser.id,
                     { password: password, user_metadata: userMetadata }
                 );

                 if (updateError) throw updateError;
                 console.log('✅ Password updated successfully!');

            } else {
                throw createError;
            }
        } else {
            console.log('✅ User created successfully!');
        }

    } catch (err: any) {
        console.error('❌ Error:', err.message);
    }
}

resetDemoUser();
