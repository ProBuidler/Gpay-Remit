package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
	"github.com/yourusername/gpay-remit/config"
	"github.com/yourusername/gpay-remit/errors"
	"github.com/yourusername/gpay-remit/logger"
	"github.com/yourusername/gpay-remit/models"
	"gorm.io/gorm"
)

// FeedbackHandler manages user feedback submission and issue tracking integration
type FeedbackHandler struct {
	db  *gorm.DB
	cfg *config.Config
}

// NewFeedbackHandler creates a new feedback handler
func NewFeedbackHandler(db *gorm.DB, cfg *config.Config) *FeedbackHandler {
	return &FeedbackHandler{
		db:  db,
		cfg: cfg,
	}
}

// SubmitFeedbackRequest is the payload for creating feedback
type SubmitFeedbackRequest struct {
	Type       string `json:"type" binding:"required"`
	Subject    string `json:"subject" binding:"required"`
	Message    string `json:"message" binding:"required"`
	Screenshot string `json:"screenshot,omitempty"`
	Priority   string `json:"priority,omitempty"`
	Metadata   string `json:"metadata,omitempty"`
}

// UpdateFeedbackStatusRequest for admin status transitions
type UpdateFeedbackStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

// SubmitFeedback handles in-app feedback submission with optional screenshot
// POST /api/v1/feedback
func (h *FeedbackHandler) SubmitFeedback(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.Error(errors.NewUnauthorizedError("Authentication required"))
		return
	}

	var req SubmitFeedbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.Error(errors.NewValidationError("Invalid request body", err.Error()))
		return
	}

	// Normalize fields
	req.Type = strings.ToLower(strings.TrimSpace(req.Type))
	req.Subject = strings.TrimSpace(req.Subject)
	req.Message = strings.TrimSpace(req.Message)
	req.Priority = strings.ToLower(strings.TrimSpace(req.Priority))
	if req.Priority == "" {
		req.Priority = string(models.FeedbackPriorityMedium)
	}

	feedback := models.Feedback{
		UserID:   userID.(uint),
		Type:     models.FeedbackType(req.Type),
		Subject:  req.Subject,
		Message:  req.Message,
		Priority: models.FeedbackPriority(req.Priority),
		Status:   models.FeedbackStatusOpen,
		Metadata: req.Metadata,
	}

	// Handle screenshot if provided (base64 data URL)
	if req.Screenshot != "" {
		screenshot := strings.TrimSpace(req.Screenshot)
		if err := models.ValidateScreenshot(screenshot); err != nil {
			c.Error(errors.NewValidationError(err.Error(), nil))
			return
		}
		feedback.Screenshot = screenshot
		feedback.ScreenshotMime = models.ExtractScreenshotMime(screenshot)
	}

	// Validate model
	if err := feedback.Validate(); err != nil {
		c.Error(errors.NewValidationError(err.Error(), nil))
		return
	}

	// Validate priority
	switch feedback.Priority {
	case models.FeedbackPriorityLow, models.FeedbackPriorityMedium, models.FeedbackPriorityHigh:
	default:
		c.Error(errors.NewValidationError("invalid priority: must be low, medium, or high", nil))
		return
	}

	if err := h.db.Create(&feedback).Error; err != nil {
		logger.Log.WithFields(logrus.Fields{
			"user_id": userID,
			"error":   err.Error(),
		}).Error("Failed to save feedback")
		c.Error(errors.NewInternalError("Failed to save feedback", err))
		return
	}

	// Integrate with issue tracking asynchronously (non-blocking)
	go h.syncWithIssueTracker(feedback)

	logger.Log.WithFields(logrus.Fields{
		"feedback_id": feedback.ID,
		"user_id":     userID,
		"type":        feedback.Type,
	}).Info("Feedback submitted")

	c.JSON(http.StatusCreated, feedback)
}

// ListFeedback returns paginated feedback
// GET /api/v1/feedback
// - Regular users see only their own feedback
// - Admins see all feedback
func (h *FeedbackHandler) ListFeedback(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.Error(errors.NewUnauthorizedError("Authentication required"))
		return
	}
	role, _ := c.Get("role")
	isAdmin := role == "admin"

	page := 1
	pageSize := 20
	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 && v <= 100 {
			pageSize = v
		}
	}
	offset := (page - 1) * pageSize

	query := h.db.Model(&models.Feedback{})
	if !isAdmin {
		query = query.Where("user_id = ?", userID.(uint))
	}
	// Optional filters
	if ft := c.Query("type"); ft != "" {
		query = query.Where("type = ?", strings.ToLower(ft))
	}
	if st := c.Query("status"); st != "" {
		query = query.Where("status = ?", strings.ToLower(st))
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		c.Error(errors.NewInternalError("Failed to count feedback", err))
		return
	}

	var feedbacks []models.Feedback
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&feedbacks).Error; err != nil {
		c.Error(errors.NewInternalError("Failed to fetch feedback", err))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":      feedbacks,
		"page":      page,
		"page_size": pageSize,
		"total":     total,
		"has_more":  int64(offset+len(feedbacks)) < total,
	})
}

// GetFeedback returns a single feedback entry
// GET /api/v1/feedback/:id
func (h *FeedbackHandler) GetFeedback(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.Error(errors.NewUnauthorizedError("Authentication required"))
		return
	}
	role, _ := c.Get("role")
	isAdmin := role == "admin"

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.Error(errors.NewValidationError("Invalid feedback ID", nil))
		return
	}

	var fb models.Feedback
	if err := h.db.First(&fb, uint(id)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.Error(errors.NewNotFoundError("Feedback not found"))
			return
		}
		c.Error(errors.NewInternalError("Failed to fetch feedback", err))
		return
	}

	// Authorization: owner or admin
	if !isAdmin && fb.UserID != userID.(uint) {
		c.Error(errors.NewForbiddenError("Not authorized to view this feedback"))
		return
	}

	c.JSON(http.StatusOK, fb)
}

// UpdateFeedbackStatus allows admin to transition feedback status
// PUT /api/v1/feedback/:id/status
func (h *FeedbackHandler) UpdateFeedbackStatus(c *gin.Context) {
	role, _ := c.Get("role")
	if role != "admin" {
		c.Error(errors.NewForbiddenError("Admin access required"))
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.Error(errors.NewValidationError("Invalid feedback ID", nil))
		return
	}

	var req UpdateFeedbackStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.Error(errors.NewValidationError("Invalid request body", err.Error()))
		return
	}
	req.Status = strings.ToLower(strings.TrimSpace(req.Status))
	valid := map[string]bool{
		string(models.FeedbackStatusOpen):       true,
		string(models.FeedbackStatusInProgress): true,
		string(models.FeedbackStatusResolved):   true,
		string(models.FeedbackStatusClosed):     true,
	}
	if !valid[req.Status] {
		c.Error(errors.NewValidationError("invalid status: must be open, in_progress, resolved, or closed", nil))
		return
	}

	var fb models.Feedback
	if err := h.db.First(&fb, uint(id)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.Error(errors.NewNotFoundError("Feedback not found"))
			return
		}
		c.Error(errors.NewInternalError("Failed to fetch feedback", err))
		return
	}

	oldStatus := fb.Status
	fb.Status = models.FeedbackStatus(req.Status)
	if err := h.db.Save(&fb).Error; err != nil {
		c.Error(errors.NewInternalError("Failed to update feedback", err))
		return
	}

	// Sync status change to issue tracker
	go h.syncStatusToIssueTracker(fb, string(oldStatus))

	logger.Log.WithFields(logrus.Fields{
		"feedback_id": fb.ID,
		"old_status":  oldStatus,
		"new_status":  fb.Status,
	}).Info("Feedback status updated")

	c.JSON(http.StatusOK, fb)
}

// DeleteFeedback allows users to delete their own open feedback or admins to delete any
// DELETE /api/v1/feedback/:id
func (h *FeedbackHandler) DeleteFeedback(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.Error(errors.NewUnauthorizedError("Authentication required"))
		return
	}
	role, _ := c.Get("role")
	isAdmin := role == "admin"

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.Error(errors.NewValidationError("Invalid feedback ID", nil))
		return
	}

	var fb models.Feedback
	if err := h.db.First(&fb, uint(id)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.Error(errors.NewNotFoundError("Feedback not found"))
			return
		}
		c.Error(errors.NewInternalError("Failed to fetch feedback", err))
		return
	}

	if !isAdmin && fb.UserID != userID.(uint) {
		c.Error(errors.NewForbiddenError("Not authorized to delete this feedback"))
		return
	}
	if !isAdmin && fb.Status != models.FeedbackStatusOpen {
		c.Error(errors.NewValidationError("Only open feedback can be deleted by owner", nil))
		return
	}

	if err := h.db.Delete(&fb).Error; err != nil {
		c.Error(errors.NewInternalError("Failed to delete feedback", err))
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Feedback deleted"})
}

// syncWithIssueTracker integrates feedback with external issue tracking
// Simulates GitHub Issues integration; in production would call GitHub API
func (h *FeedbackHandler) syncWithIssueTracker(fb models.Feedback) {
	// Build issue payload
	title := fmt.Sprintf("[Feedback:%s] %s", strings.ToUpper(string(fb.Type)), fb.Subject)
	bodyMap := map[string]interface{}{
		"feedback_id":    fb.ID,
		"user_id":        fb.UserID,
		"type":           fb.Type,
		"priority":       fb.Priority,
		"message":        fb.Message,
		"has_screenshot": fb.Screenshot != "",
		"metadata":       fb.Metadata,
	}
	bodyBytes, _ := json.MarshalIndent(bodyMap, "", "  ")

	// Simulate external call - log and generate tracker ID
	// In production, this would be: POST https://api.github.com/repos/parkerwinner/Gpay-Remit/issues
	// with authentication via cfg.GitHubToken
	trackerID := fmt.Sprintf("FB-%d-%d", fb.UserID, fb.ID)
	trackerURL := fmt.Sprintf("https://github.com/parkerwinner/Gpay-Remit/issues/%d", fb.ID+1000)

	logger.Log.WithFields(logrus.Fields{
		"feedback_id": fb.ID,
		"tracker_id":  trackerID,
		"title":       title,
		"body":        string(bodyBytes),
	}).Info("Issue tracking: created ticket for feedback")

	// Persist tracker reference back to DB
	// Use separate DB handle to avoid concurrency issues with original context
	time.Sleep(100 * time.Millisecond) // simulate network latency
	if err := h.db.Model(&models.Feedback{}).Where("id = ?", fb.ID).Updates(map[string]interface{}{
		"issue_tracker_id":  trackerID,
		"issue_tracker_url": trackerURL,
	}).Error; err != nil {
		logger.Log.WithFields(logrus.Fields{
			"feedback_id": fb.ID,
			"error":       err.Error(),
		}).Warn("Failed to persist issue tracker reference")
	}

	// Optionally notify via webhook or email - fire-and-forget
	_ = bodyBytes
	_ = title
	_ = time.Now()
}

func (h *FeedbackHandler) syncStatusToIssueTracker(fb models.Feedback, oldStatus string) {
	logger.Log.WithFields(logrus.Fields{
		"feedback_id": fb.ID,
		"tracker_id":  fb.IssueTrackerID,
		"old_status":  oldStatus,
		"new_status":  fb.Status,
	}).Info("Issue tracking: status synced")
	// In production, PATCH GitHub issue state or add comment
	// e.g., if fb.Status == "resolved" -> close GitHub issue
}
