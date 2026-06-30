// api/service/upload.go
package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/court-command/court-command/db/generated"
)

const (
	// MaxUploadSize is the maximum allowed upload size (10 MB).
	MaxUploadSize = 10 << 20

	// DefaultUploadDir is the default directory for file uploads.
	DefaultUploadDir = "uploads"
)

// AllowedContentTypes defines the accepted MIME types for file uploads.
var AllowedContentTypes = map[string]bool{
	"image/jpeg":      true,
	"image/png":       true,
	"image/gif":       true,
	"image/webp":      true,
	"application/pdf": true,
}

// UploadService handles file upload business logic.
type UploadService struct {
	queries   *generated.Queries
	uploadDir string
}

// NewUploadService creates a new UploadService.
func NewUploadService(queries *generated.Queries, uploadDir string) *UploadService {
	if uploadDir == "" {
		uploadDir = DefaultUploadDir
	}
	return &UploadService{queries: queries, uploadDir: uploadDir}
}

// UploadResponse is the public representation of an upload.
type UploadResponse struct {
	ID           int64   `json:"id"`
	Filename     string  `json:"filename"`
	OriginalName string  `json:"original_name"`
	ContentType  string  `json:"content_type"`
	SizeBytes    int64   `json:"size_bytes"`
	URL          string  `json:"url"`
	EntityType   *string `json:"entity_type,omitempty"`
	EntityID     *int64  `json:"entity_id,omitempty"`
	CreatedAt    string  `json:"created_at"`
}

// toUploadResponse converts a generated Upload to a response DTO.
func toUploadResponse(u generated.Upload) UploadResponse {
	resp := UploadResponse{
		ID:           u.ID,
		Filename:     u.Filename,
		OriginalName: u.OriginalName,
		ContentType:  u.ContentType,
		SizeBytes:    u.SizeBytes,
		URL:          "/uploads/" + u.Filename,
		EntityType:   u.EntityType,
		CreatedAt:    u.CreatedAt.Format(time.RFC3339),
	}
	if u.EntityID.Valid {
		resp.EntityID = &u.EntityID.Int64
	}
	return resp
}

// SaveFile validates and saves an uploaded file to disk, then records it in the database.
func (s *UploadService) SaveFile(ctx context.Context, userID int64, file io.Reader, originalName, contentType string, size int64, entityType *string, entityID *int64) (*UploadResponse, error) {
	if !AllowedContentTypes[contentType] {
		return nil, NewValidation("unsupported file type: " + contentType)
	}
	if size > MaxUploadSize {
		return nil, NewValidation("file too large (max 10MB)")
	}

	// Generate unique filename
	randBytes := make([]byte, 16)
	if _, err := rand.Read(randBytes); err != nil {
		return nil, fmt.Errorf("generating filename: %w", err)
	}
	// Always derive the on-disk extension from the validated/sniffed
	// contentType, never from the client-controlled original filename.
	// contentType is already gated by AllowedContentTypes above, so this
	// can only ever yield a safe allowlisted extension (.jpg/.png/.gif/
	// .webp/.pdf) and never .html/.svg/.xhtml. The original filename is
	// retained only in the DB original_name column for display.
	ext := extensionFromContentType(contentType)
	filename := hex.EncodeToString(randBytes) + ext

	// Ensure upload directory exists
	if err := os.MkdirAll(s.uploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("creating upload directory: %w", err)
	}

	// Write file to disk
	destPath := filepath.Join(s.uploadDir, filename)
	dst, err := os.Create(destPath)
	if err != nil {
		return nil, fmt.Errorf("creating file: %w", err)
	}
	defer dst.Close()

	written, err := io.Copy(dst, io.LimitReader(file, MaxUploadSize+1))
	if err != nil {
		os.Remove(destPath)
		return nil, fmt.Errorf("writing file: %w", err)
	}
	if written > MaxUploadSize {
		os.Remove(destPath)
		return nil, NewValidation("file too large (max 10MB)")
	}

	// Save record to database
	var eid pgtype.Int8
	if entityID != nil {
		eid = pgtype.Int8{Int64: *entityID, Valid: true}
	}

	upload, err := s.queries.CreateUpload(ctx, generated.CreateUploadParams{
		UserID:       userID,
		Filename:     filename,
		OriginalName: originalName,
		ContentType:  contentType,
		SizeBytes:    written,
		EntityType:   entityType,
		EntityID:     eid,
	})
	if err != nil {
		os.Remove(destPath)
		return nil, fmt.Errorf("saving upload record: %w", err)
	}

	resp := toUploadResponse(upload)
	return &resp, nil
}

// ListUploads returns a paginated list of uploads for a user.
func (s *UploadService) ListUploads(ctx context.Context, userID int64, limit, offset int32) ([]UploadResponse, int64, error) {
	uploads, err := s.queries.ListUploadsByUser(ctx, generated.ListUploadsByUserParams{
		UserID: userID,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("listing uploads: %w", err)
	}

	total, err := s.queries.CountUploadsByUser(ctx, userID)
	if err != nil {
		return nil, 0, fmt.Errorf("counting uploads: %w", err)
	}

	result := make([]UploadResponse, len(uploads))
	for i, u := range uploads {
		result[i] = toUploadResponse(u)
	}

	return result, total, nil
}

// DeleteUpload removes an upload record and its file from disk.
func (s *UploadService) DeleteUpload(ctx context.Context, uploadID, userID int64) error {
	upload, err := s.queries.GetUploadByID(ctx, uploadID)
	if err != nil {
		return NewNotFound("upload not found")
	}
	if upload.UserID != userID {
		return NewForbidden("you do not own this upload")
	}

	// Delete the file from disk
	destPath := filepath.Join(s.uploadDir, upload.Filename)
	os.Remove(destPath) // best-effort file removal

	return s.queries.DeleteUpload(ctx, generated.DeleteUploadParams{
		ID:     uploadID,
		UserID: userID,
	})
}

// extensionFromContentType returns a file extension for a known content type.
func extensionFromContentType(ct string) string {
	switch strings.ToLower(ct) {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "application/pdf":
		return ".pdf"
	default:
		return ""
	}
}

// CleanOrphanedUploads finds and deletes upload files that are no longer
// referenced by any entity. Only removes files older than the given age.
// Returns the count of deleted files.
func (s *UploadService) CleanOrphanedUploads(ctx context.Context, olderThan time.Duration) (int, error) {
	threshold := time.Now().Add(-olderThan)
	orphans, err := s.queries.ListOrphanedUploads(ctx, threshold)
	if err != nil {
		return 0, fmt.Errorf("listing orphaned uploads: %w", err)
	}

	deleted := 0
	for _, upload := range orphans {
		// Delete file from disk
		filePath := filepath.Join(s.uploadDir, upload.Filename)
		if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
			// Log but continue — the DB record should still be cleaned up
			continue
		}

		// Delete DB record
		if err := s.queries.DeleteUploadByID(ctx, upload.ID); err != nil {
			continue
		}
		deleted++
	}

	return deleted, nil
}
