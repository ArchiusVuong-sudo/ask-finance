-- ============================================
-- Fix RLS Policies
-- - Add missing policies for organization_members
-- - Fix infinite recursion in documents policy
-- ============================================

-- Organization members policies
-- Users can see their own organization memberships
CREATE POLICY "Users can view own memberships" ON organization_members
    FOR SELECT USING (user_id = auth.uid());

-- Users can see other members in their organizations
CREATE POLICY "Users can view org members" ON organization_members
    FOR SELECT USING (
        organization_id IN (
            SELECT om.organization_id
            FROM organization_members om
            WHERE om.user_id = auth.uid()
        )
    );

-- Organizations policies
CREATE POLICY "Users can view their organizations" ON organizations
    FOR SELECT USING (
        id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- Business units policies
CREATE POLICY "Users can view business units in their org" ON business_units
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()
        )
    );

-- User business units policies
CREATE POLICY "Users can view own BU assignments" ON user_business_units
    FOR SELECT USING (user_id = auth.uid());

-- Fix documents policy - simplify to avoid recursion
-- First drop the existing policy
DROP POLICY IF EXISTS "Users can view accessible documents" ON documents;

-- Create simpler policy without recursive function calls
CREATE POLICY "Users can view accessible documents" ON documents
    FOR SELECT USING (
        user_id = auth.uid()
        OR visibility = 'public'
    );

-- Fix document chunks policy
DROP POLICY IF EXISTS "Users can view chunks of accessible documents" ON document_chunks;

CREATE POLICY "Users can view chunks of accessible documents" ON document_chunks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_chunks.document_id
            AND (d.user_id = auth.uid() OR d.visibility = 'public')
        )
    );
