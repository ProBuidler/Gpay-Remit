package models

import (
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
)

// FeedbackType defines allowed feedback categories
type FeedbackType string

const (
	FeedbackTypeBug         FeedbackType = "bug"
	FeedbackTypeFeature     FeedbackType = "feature"
	FeedbackTypeImprovement FeedbackType = "improvement"
	FeedbackTypeOther       FeedbackType = "other"
)

// FeedbackStatus defines lifecycle states
type FeedbackStatus string

const (
	FeedbackStatusOpen       FeedbackStatus = "open"
	FeedbackStatusInProgress FeedbackStatus = "in_progress"
	FeedbackStatusResolved   FeedbackStatus = "resolved"
	FeedbackStatusClosed     FeedbackStatus = "closed"
)

// FeedbackPriority defines urgency levels
type FeedbackPriority string

const (
	FeedbackPriorityLow    FeedbackPriority = "low"
	FeedbackPriorityMedium FeedbackPriority = "medium"
	FeedbackPriorityHigh   FeedbackPriority = "high"
)

// Feedback represents user-submitted feedback with optional screenshot
type Feedback struct {
	ID              uint             `gorm:"primaryKey" json:"id"`
	CreatedAt       time.Time        `json:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at"`
	DeletedAt       gorm.DeletedAt   `gorm:"index" json:"-"`
	UserID          uint             `gorm:"index;not null" json:"user_id"`
	User            User             `gorm:"foreignKey:UserID" json:"-"`
	Type            FeedbackType     `gorm:"size:20;not null" json:"type"`
	Subject         string           `gorm:"size:255;not null" json:"subject"`
	Message         string           `gorm:"type:text;not null" json:"message"`
	Screenshot      string           `gorm:"type:text" json:"screenshot,omitempty"`
	ScreenshotMime  string           `gorm:"size:20" json:"screenshot_mime,omitempty"`
	Status          FeedbackStatus   `gorm:"size:20;default:'open'" json:"status"`
	Priority        FeedbackPriority `gorm:"size:20;default:'medium'" json:"priority"`
	IssueTrackerID  string           `gorm:"size:255" json:"issue_tracker_id,omitempty"`
	IssueTrackerURL string           `gorm:"size:500" json:"issue_tracker_url,omitempty"`
	Metadata        string           `gorm:"type:text" json:"metadata,omitempty"` // JSON string for browser/OS/context
}

func (Feedback) TableName() string {
	return "feedbacks"
}

// Validate checks required fields and screenshot constraints
func (f *Feedback) Validate() error {
	if strings.TrimSpace(f.Subject) == "" {
		return errors.New("subject is required")
	}
	if len(f.Subject) > 255 {
		return errors.New("subject must be at most 255 characters")
	}
	if strings.TrimSpace(f.Message) == "" {
		return errors.New("message is required")
	}
	if len(f.Message) > 5000 {
		return errors.New("message must be at most 5000 characters")
	}
	switch f.Type {
	case FeedbackTypeBug, FeedbackTypeFeature, FeedbackTypeImprovement, FeedbackTypeOther:
	default:
		return errors.New("invalid feedback type: must be bug, feature, improvement, or other")
	}
	if f.Screenshot != "" {
		if err := ValidateScreenshot(f.Screenshot); err != nil {
			return err
		}
	}
	return nil
}

// ValidateScreenshot ensures base64 data URL is valid image and within size limits (5MB)
func ValidateScreenshot(dataURL string) error {
	const maxSizeBytes = 5 * 1024 * 1024      // 5MB decoded
	const maxBase64Len = maxSizeBytes * 4 / 3 // ~6.6MB base64

	if len(dataURL) > maxBase64Len+100 {
		return errors.New("screenshot exceeds 5MB limit")
	}

	// Expected format: data:image/png;base64,<data>  or data:image/jpeg;base64,<data>
	if !strings.HasPrefix(dataURL, "data:image/") {
		return errors.New("screenshot must be a data URL starting with data:image/")
	}
	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) != 2 {
		return errors.New("invalid screenshot data URL format")
	}
	header := parts[0]
	body := parts[1]

	if !strings.Contains(header, ";base64") {
		return errors.New("screenshot data URL must be base64 encoded")
	}

	allowedMimes := []string{"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
	mimeOk := false
	for _, m := range allowedMimes {
		if strings.Contains(header, m) {
			mimeOk = true
			break
		}
	}
	if !mimeOk {
		return errors.New("screenshot must be png, jpeg, jpg, webp, or gif")
	}

	// Validate base64 decodes
	decoded, err := base64.StdEncoding.DecodeString(body)
	if err != nil {
		// Try RawStdEncoding without padding variations
		decoded2, err2 := base64.StdEncoding.DecodeString(strings.TrimSpace(body))
		if err2 != nil {
			return errors.New("screenshot contains invalid base64 data")
		}
		decoded = decoded2
	}
	if len(decoded) > maxSizeBytes {
		return errors.New("screenshot decoded size exceeds 5MB")
	}
	if len(decoded) == 0 {
		return errors.New("screenshot is empty")
	}
	return nil
}

// ExtractScreenshotMime returns mime type from data URL
func ExtractScreenshotMime(dataURL string) string {
	if !strings.HasPrefix(dataURL, "data:image/") {
		return ""
	}
	parts := strings.SplitN(dataURL, ",", 2)
	if len(parts) < 1 {
		return ""
	}
	header := parts[0]
	// header like data:image/png;base64
	header = strings.TrimPrefix(header, "data:")
	semi := strings.Index(header, ";")
	if semi > 0 {
		return header[:semi]
	}
	return header
}
