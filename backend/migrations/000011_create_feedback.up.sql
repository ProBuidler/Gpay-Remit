CREATE TABLE IF NOT EXISTS feedbacks (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('bug','feature','improvement','other')),
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    screenshot TEXT,
    screenshot_mime VARCHAR(20),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
    issue_tracker_id VARCHAR(255),
    issue_tracker_url VARCHAR(500),
    metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedbacks_deleted_at ON feedbacks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_type ON feedbacks(type);
