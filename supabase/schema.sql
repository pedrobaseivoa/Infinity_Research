-- ============================================================
-- INFINITY RESEARCH - COMPLETE SQL SCHEMA
-- Execute this script in the Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. REQUIRED EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. TABELA: profiles
-- Extension of auth.users with additional data
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to automatically create profile when user registers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- ============================================================
-- 3. TABELA: user_settings
-- API Keys and user preferences (BYOK)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

    -- 🔴 API Keys (BYOK - Bring Your Own Key)
    openrouter_api_key TEXT,                    -- Required for processing
    semantic_scholar_api_key TEXT,              -- Optional (improves rate limit)
    openalex_api_key TEXT,                      -- Optional (improves rate limit)
    core_api_key TEXT,                          -- Optional (required for CORE API)

    -- Preferences
    default_model TEXT DEFAULT 'openrouter/auto',

    -- Usage limits
    articles_processed_this_month INTEGER DEFAULT 0,
    monthly_limit INTEGER DEFAULT 100,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to automatically create settings
CREATE OR REPLACE FUNCTION public.handle_new_user_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_settings
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_settings();

-- RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
    ON public.user_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
    ON public.user_settings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
    ON public.user_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 4. TABELA: articles
-- Articles and processing data (7 phases)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Original PDF
    pdf_url TEXT,
    pdf_storage_path TEXT,
    pdf_filename TEXT,

    -- General Status
    status TEXT DEFAULT 'uploaded' CHECK (status IN (
        'uploaded', 'processing', 'completed', 'failed'
    )),
    current_phase INTEGER DEFAULT 0,
    error_message TEXT,

    -- ==================== PHASE 1: Metadata Extraction ====================
    phase1_json JSONB,
    phase1_status TEXT DEFAULT 'pending' CHECK (phase1_status IN ('pending', 'running', 'completed', 'failed')),
    phase1_model TEXT,
    phase1_cost NUMERIC(10,6) DEFAULT 0,
    phase1_tokens INTEGER DEFAULT 0,
    phase1_duration_ms INTEGER,
    phase1_prompt_tokens INTEGER,
    phase1_completion_tokens INTEGER,
    phase1_completed_at TIMESTAMPTZ,

    -- ==================== PHASE 2: 11 APIs Enrichment ====================
    phase2_json JSONB,
    phase2_status TEXT DEFAULT 'pending' CHECK (phase2_status IN ('pending', 'running', 'completed', 'failed')),
    phase2_apis_success INTEGER DEFAULT 0,
    phase2_apis_failed INTEGER DEFAULT 0,
    phase2_duration_ms INTEGER,
    phase2_completed_at TIMESTAMPTZ,

    -- ==================== PHASE 3: Consensus with Provenance ====================
    phase3_json JSONB,
    phase3_status TEXT DEFAULT 'pending' CHECK (phase3_status IN ('pending', 'running', 'completed', 'failed')),
    phase3_model TEXT,
    phase3_cost NUMERIC(10,6) DEFAULT 0,
    phase3_tokens INTEGER DEFAULT 0,
    phase3_duration_ms INTEGER,
    phase3_prompt_tokens INTEGER,
    phase3_completion_tokens INTEGER,
    phase3_completed_at TIMESTAMPTZ,

    -- ==================== PHASE 4: Multi-Model Scientific Extraction ====================
    phase4_json JSONB,
    phase4_status TEXT DEFAULT 'pending' CHECK (phase4_status IN ('pending', 'running', 'completed', 'failed')),
    phase4_models TEXT[],
    phase4_cost NUMERIC(10,6) DEFAULT 0,
    phase4_tokens INTEGER DEFAULT 0,
    phase4_duration_ms INTEGER,
    phase4_prompt_tokens INTEGER,
    phase4_completion_tokens INTEGER,
    phase4_completed_at TIMESTAMPTZ,

    -- ==================== PHASE 5: Visual + Tables Extraction ====================
    phase5_json JSONB,
    phase5_status TEXT DEFAULT 'pending' CHECK (phase5_status IN ('pending', 'running', 'completed', 'failed')),
    phase5_models TEXT[],
    phase5_cost NUMERIC(10,6) DEFAULT 0,
    phase5_tokens INTEGER DEFAULT 0,
    phase5_duration_ms INTEGER,
    phase5_prompt_tokens INTEGER,
    phase5_completion_tokens INTEGER,
    phase5_completed_at TIMESTAMPTZ,

    -- ==================== PHASE 6: Scientific Consolidation ====================
    phase6_json JSONB,
    phase6_status TEXT DEFAULT 'pending' CHECK (phase6_status IN ('pending', 'running', 'completed', 'failed')),
    phase6_model TEXT,
    phase6_cost NUMERIC(10,6) DEFAULT 0,
    phase6_tokens INTEGER DEFAULT 0,
    phase6_duration_ms INTEGER,
    phase6_prompt_tokens INTEGER,
    phase6_completion_tokens INTEGER,
    phase6_completed_at TIMESTAMPTZ,

    -- ==================== PHASE 7: Final Merge ====================
    phase7_json JSONB,
    phase7_status TEXT DEFAULT 'pending' CHECK (phase7_status IN ('pending', 'running', 'completed', 'failed')),
    phase7_duration_ms INTEGER,
    phase7_completed_at TIMESTAMPTZ,

    -- ==================== TOTALS ====================
    total_cost NUMERIC(10,6) DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,

    -- Timestamps
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to automatically calculate total_cost
CREATE OR REPLACE FUNCTION public.calculate_article_totals()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_cost := COALESCE(NEW.phase1_cost, 0) +
                      COALESCE(NEW.phase3_cost, 0) +
                      COALESCE(NEW.phase4_cost, 0) +
                      COALESCE(NEW.phase5_cost, 0) +
                      COALESCE(NEW.phase6_cost, 0);

    NEW.total_tokens := COALESCE(NEW.phase1_tokens, 0) +
                        COALESCE(NEW.phase3_tokens, 0) +
                        COALESCE(NEW.phase4_tokens, 0) +
                        COALESCE(NEW.phase5_tokens, 0) +
                        COALESCE(NEW.phase6_tokens, 0);

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_totals ON public.articles;
CREATE TRIGGER calculate_totals
    BEFORE UPDATE ON public.articles
    FOR EACH ROW EXECUTE FUNCTION public.calculate_article_totals();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_articles_user_id ON public.articles(user_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON public.articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON public.articles(created_at DESC);

-- RLS
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own articles"
    ON public.articles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own articles"
    ON public.articles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own articles"
    ON public.articles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own articles"
    ON public.articles FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- 5. TABELA: processing_jobs
-- Processing queue and logs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed'
    )),
    current_phase INTEGER DEFAULT 1,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

    -- Retry logic
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,

    -- Logs and errors
    error_message TEXT,
    logs JSONB DEFAULT '[]'::JSONB,

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_article_id ON public.processing_jobs(article_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.processing_jobs(created_at DESC);

-- RLS
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
    ON public.processing_jobs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own jobs"
    ON public.processing_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 6. STORAGE: Bucket for PDFs
-- ============================================================

-- Create bucket (execute via Dashboard or API)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('article-pdfs', 'article-pdfs', false);

-- RLS for Storage (execute via Dashboard)
-- Policies already defined in documentation

-- ============================================================
-- 7. REALTIME: Enable for real-time updates
-- ============================================================

-- Enable Realtime for articles
ALTER PUBLICATION supabase_realtime ADD TABLE public.articles;

-- Enable Realtime for processing_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.processing_jobs;

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================

-- Function to get user statistics
CREATE OR REPLACE FUNCTION public.get_user_stats(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_articles', COUNT(*),
        'completed_articles', COUNT(*) FILTER (WHERE status = 'completed'),
        'processing_articles', COUNT(*) FILTER (WHERE status = 'processing'),
        'failed_articles', COUNT(*) FILTER (WHERE status = 'failed'),
        'total_cost', COALESCE(SUM(total_cost), 0),
        'total_tokens', COALESCE(SUM(total_tokens), 0)
    ) INTO result
    FROM public.articles
    WHERE user_id = p_user_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset monthly counter
CREATE OR REPLACE FUNCTION public.reset_monthly_counters()
RETURNS void AS $$
BEGIN
    UPDATE public.user_settings
    SET articles_processed_this_month = 0,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. GRANTS (for service_role to access everything)
-- ============================================================

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_settings TO service_role;
GRANT ALL ON public.articles TO service_role;
GRANT ALL ON public.processing_jobs TO service_role;

-- ============================================================
-- END OF SCHEMA
-- ============================================================
