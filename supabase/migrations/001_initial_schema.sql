-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- 1. Profiles Table
-- ============================================
CREATE TYPE user_role AS ENUM ('viewer', 'analyst', 'bu_manager', 'group_cfo', 'admin');

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role user_role DEFAULT 'viewer',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Organizations Table
-- ============================================
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. Organization Members
-- ============================================
CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role user_role DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

-- ============================================
-- 4. Business Units (Hierarchical)
-- ============================================
CREATE TABLE business_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    parent_id UUID REFERENCES business_units(id) ON DELETE SET NULL,
    level INTEGER DEFAULT 0,
    path TEXT[], -- Array path for hierarchy
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

-- ============================================
-- 5. User Business Units (Access Mapping)
-- ============================================
CREATE TABLE user_business_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    business_unit_id UUID REFERENCES business_units(id) ON DELETE CASCADE,
    access_level TEXT DEFAULT 'read', -- read, write, admin
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, business_unit_id)
);

-- ============================================
-- 6. Threads (Chat Conversations)
-- ============================================
CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Conversation',
    session_id TEXT, -- Claude Agent SDK session ID
    metadata JSONB DEFAULT '{}',
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. Messages
-- ============================================
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID REFERENCES threads(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    content TEXT NOT NULL,
    tool_calls JSONB DEFAULT '[]',
    citations JSONB DEFAULT '[]',
    canvas_content JSONB, -- For charts, tables, images
    token_usage JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. Documents (Knowledge Base)
-- ============================================
CREATE TYPE document_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE document_type AS ENUM ('pdf', 'excel', 'csv', 'image', 'other');

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    document_type document_type DEFAULT 'other',
    status document_status DEFAULT 'pending',
    processing_error TEXT,
    finance_metadata JSONB DEFAULT '{}', -- period, doc_type, metrics
    visibility TEXT DEFAULT 'private', -- private, organization, public
    business_unit_id UUID REFERENCES business_units(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. Document Chunks (RAG)
-- ============================================
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI ada-002 dimension
    metadata JSONB DEFAULT '{}', -- page, section, tables
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX document_chunks_embedding_idx ON document_chunks
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- 10. Usage Logs (Audit Trail)
-- ============================================
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Functions
-- ============================================

-- Vector similarity search
CREATE OR REPLACE FUNCTION match_document_chunks(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10,
    filter_document_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.metadata,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM document_chunks dc
    WHERE
        (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
        AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Get accessible document IDs for a user
CREATE OR REPLACE FUNCTION get_accessible_document_ids(p_user_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role user_role;
    accessible_ids UUID[];
BEGIN
    -- Get user's role
    SELECT role INTO user_role FROM profiles WHERE id = p_user_id;

    -- Admin and Group CFO see all documents
    IF user_role IN ('admin', 'group_cfo') THEN
        SELECT ARRAY_AGG(id) INTO accessible_ids FROM documents;
    ELSE
        -- Others see their own + organization + assigned BU docs
        SELECT ARRAY_AGG(DISTINCT d.id) INTO accessible_ids
        FROM documents d
        LEFT JOIN user_business_units ubu ON d.business_unit_id = ubu.business_unit_id
        WHERE
            d.user_id = p_user_id
            OR d.visibility = 'public'
            OR (d.visibility = 'organization' AND d.organization_id IN (
                SELECT organization_id FROM organization_members WHERE user_id = p_user_id
            ))
            OR ubu.user_id = p_user_id;
    END IF;

    RETURN COALESCE(accessible_ids, ARRAY[]::UUID[]);
END;
$$;

-- Check if user can access a business unit
CREATE OR REPLACE FUNCTION user_can_access_business_unit(
    p_user_id UUID,
    p_business_unit_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role user_role;
BEGIN
    SELECT role INTO user_role FROM profiles WHERE id = p_user_id;

    -- Admin and Group CFO have access to all BUs
    IF user_role IN ('admin', 'group_cfo') THEN
        RETURN TRUE;
    END IF;

    -- Check if user is assigned to this BU
    RETURN EXISTS (
        SELECT 1 FROM user_business_units
        WHERE user_id = p_user_id AND business_unit_id = p_business_unit_id
    );
END;
$$;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_units_updated_at
    BEFORE UPDATE ON business_units
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_threads_updated_at
    BEFORE UPDATE ON threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Threads policies
CREATE POLICY "Users can view own threads" ON threads
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create threads" ON threads
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own threads" ON threads
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own threads" ON threads
    FOR DELETE USING (auth.uid() = user_id);

-- Messages policies
CREATE POLICY "Users can view messages in own threads" ON messages
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM threads WHERE threads.id = messages.thread_id AND threads.user_id = auth.uid())
    );
CREATE POLICY "Users can create messages in own threads" ON messages
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM threads WHERE threads.id = messages.thread_id AND threads.user_id = auth.uid())
    );

-- Documents policies
CREATE POLICY "Users can view accessible documents" ON documents
    FOR SELECT USING (
        user_id = auth.uid()
        OR visibility = 'public'
        OR (visibility = 'organization' AND organization_id IN (
            SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        ))
        OR id = ANY(get_accessible_document_ids(auth.uid()))
    );
CREATE POLICY "Users can create documents" ON documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON documents
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON documents
    FOR DELETE USING (auth.uid() = user_id);

-- Document chunks policies
CREATE POLICY "Users can view chunks of accessible documents" ON document_chunks
    FOR SELECT USING (
        document_id = ANY(get_accessible_document_ids(auth.uid()))
    );

-- Usage logs policies (admins only for viewing)
CREATE POLICY "Admins can view usage logs" ON usage_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "System can insert usage logs" ON usage_logs
    FOR INSERT WITH CHECK (true);

-- ============================================
-- Storage Buckets (created via Supabase Dashboard or API)
-- ============================================
-- Note: Create these buckets in Supabase Dashboard:
-- 1. documents - For uploaded files
-- 2. exports - For generated Excel/PPT files
-- 3. generated-images - For AI-generated images
-- 4. avatars - For user profile pictures
-- 5. workfiles - For working copies of spreadsheets

-- Create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
