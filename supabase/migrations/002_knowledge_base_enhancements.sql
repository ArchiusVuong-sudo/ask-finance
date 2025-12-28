-- ============================================
-- Knowledge Base Enhancements
-- - Add is_enabled toggle for including/excluding files from search
-- - Add version control for documents
-- - Improve user isolation in search
-- ============================================

-- Add is_enabled column to documents for toggling inclusion in knowledge base
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT TRUE;

-- Add version tracking columns
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES documents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT TRUE;

-- Add description column for better organization
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add tags for categorization
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_documents_user_enabled ON documents(user_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_documents_is_latest ON documents(is_latest);
CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id);
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING GIN(tags);

-- ============================================
-- Document Versions Table (for tracking all changes)
-- ============================================
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    change_summary TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id);

-- ============================================
-- Update match_document_chunks to filter by enabled documents
-- ============================================
CREATE OR REPLACE FUNCTION match_document_chunks(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 10,
    filter_document_ids UUID[] DEFAULT NULL,
    filter_user_id UUID DEFAULT NULL,
    include_disabled BOOLEAN DEFAULT FALSE
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
    JOIN documents d ON dc.document_id = d.id
    WHERE
        -- Filter by document IDs if provided
        (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
        -- Filter by user if provided (for user isolation)
        AND (filter_user_id IS NULL OR d.user_id = filter_user_id OR d.visibility != 'private')
        -- Only include enabled documents unless explicitly requested
        AND (include_disabled = TRUE OR d.is_enabled = TRUE)
        -- Only include latest versions
        AND d.is_latest = TRUE
        -- Match similarity threshold
        AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================
-- Function to create a new version of a document
-- ============================================
CREATE OR REPLACE FUNCTION create_document_version(
    p_document_id UUID,
    p_new_file_path TEXT,
    p_new_file_size INTEGER,
    p_change_summary TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_document documents%ROWTYPE;
    v_new_version INTEGER;
    v_new_id UUID;
BEGIN
    -- Get the current document
    SELECT * INTO v_old_document FROM documents WHERE id = p_document_id;

    IF v_old_document.id IS NULL THEN
        RAISE EXCEPTION 'Document not found';
    END IF;

    -- Calculate new version number
    v_new_version := v_old_document.version + 1;

    -- Archive the old version in document_versions
    INSERT INTO document_versions (document_id, version, name, file_path, file_size, change_summary, created_by)
    VALUES (p_document_id, v_old_document.version, v_old_document.name, v_old_document.file_path,
            v_old_document.file_size, p_change_summary, auth.uid());

    -- Update the current document with new version info
    UPDATE documents
    SET
        file_path = p_new_file_path,
        file_size = p_new_file_size,
        version = v_new_version,
        updated_at = NOW()
    WHERE id = p_document_id
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- ============================================
-- Function to get document history
-- ============================================
CREATE OR REPLACE FUNCTION get_document_history(p_document_id UUID)
RETURNS TABLE (
    version INTEGER,
    name TEXT,
    file_path TEXT,
    file_size INTEGER,
    change_summary TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if user has access
    IF NOT EXISTS (
        SELECT 1 FROM documents d
        WHERE d.id = p_document_id
        AND (d.user_id = auth.uid() OR d.visibility != 'private')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    -- Current version
    SELECT
        d.version,
        d.name,
        d.file_path,
        d.file_size,
        'Current version'::TEXT as change_summary,
        d.user_id as created_by,
        d.updated_at as created_at
    FROM documents d
    WHERE d.id = p_document_id

    UNION ALL

    -- Historical versions
    SELECT
        dv.version,
        dv.name,
        dv.file_path,
        dv.file_size,
        dv.change_summary,
        dv.created_by,
        dv.created_at
    FROM document_versions dv
    WHERE dv.document_id = p_document_id

    ORDER BY version DESC;
END;
$$;

-- ============================================
-- RLS for document_versions
-- ============================================
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view versions of accessible documents" ON document_versions
    FOR SELECT USING (
        document_id IN (
            SELECT id FROM documents WHERE
                user_id = auth.uid()
                OR visibility = 'public'
                OR id = ANY(get_accessible_document_ids(auth.uid()))
        )
    );

-- ============================================
-- Update existing documents to have is_enabled = true
-- ============================================
UPDATE documents SET is_enabled = TRUE WHERE is_enabled IS NULL;
UPDATE documents SET is_latest = TRUE WHERE is_latest IS NULL;
UPDATE documents SET version = 1 WHERE version IS NULL;
