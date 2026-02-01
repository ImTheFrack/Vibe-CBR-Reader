# Lazy Loading Scan Refactor - Learnings & Conventions

## Project Structure
- **Backend**: Python FastAPI with SQLite database
- **Frontend**: Vanilla JavaScript with modular ES6 imports
- **Database**: SQLite with `comics.db` file
- **Authentication**: Session-based with cookies

## Key Files
- `database.py` - Schema and CRUD operations
- `routes/auth.py` - Authentication endpoints
- `dependencies.py` - FastAPI dependencies for auth
- `static/js/auth.js` - Frontend authentication logic
- `static/js/main.js` - App initialization

## Database Schema Patterns
- Use `init_db()` to create tables with `CREATE TABLE IF NOT EXISTS`
- Follow existing pattern for table creation (see users, sessions tables)
- Use `conn.row_factory = sqlite3.Row` for dict-like access
- Foreign key constraints are used (ON DELETE CASCADE)

## Authentication Patterns
- `get_current_user` - Raises 401 if not authenticated
- `get_optional_user` - Returns None if not authenticated
- `get_admin_user` - Requires admin role
- Session tokens stored in cookies with `session_token` key
- Cookie settings: httponly=True, samesite="lax"

## Frontend Patterns
- State management in `state.js`
- Auth status checked via `checkAuthStatus()` on init
- Login modal shown via `showLoginModal()`
- UI updates via `updateAuthUI()`

## Git Commit Convention
- Format: `feat(scope): description`
- Example: `feat(db): add scan_jobs table`

## Critical Notes
- SQLite has limited ALTER TABLE support - be careful with migrations
- Cookie expiration: 7 days currently (168 hours = 604800 seconds)
- Target: 30 days (720 hours = 2592000 seconds)
- Do NOT modify `get_optional_user` to redirect - return 401 instead

## 2026-02-01 - Task 1: Database Schema Changes (COMPLETED)

### Implementation Details
- **scan_jobs table**: Created with columns: id, started_at, completed_at, status, total_comics, processed_comics, errors (JSON), scan_type
- **comics table modifications**: Added has_thumbnail BOOLEAN column (default 0)
- **Index**: Created idx_scan_jobs_status for fast polling queries
- **WAL mode**: Enabled PRAGMA journal_mode=WAL for better concurrency
- **Data migration**: Automatically sets has_thumbnail=1 for already processed comics

### CRUD Functions Added
- `create_scan_job(scan_type, total_comics)` - Creates new scan job, returns job_id
- `update_scan_progress(job_id, processed_comics, errors)` - Updates progress during scan
- `complete_scan_job(job_id, status, errors)` - Marks job as completed/failed
- `get_scan_status(job_id)` - Retrieves specific job status
- `get_latest_scan_job()` - Gets most recent scan job
- `get_running_scan_job()` - Gets currently running job (if any)

### Key Decisions
- Used ALTER TABLE ADD COLUMN with try/except for backward compatibility (SQLite limitation)
- Stored errors as JSON string in database for flexibility
- Status enum: 'running', 'completed', 'failed'
- scan_type enum: 'fast' (default), extensible for future types
- All CRUD functions parse JSON errors automatically

### Testing Results
- Schema initialization: ✓ PASS
- All tables created: ✓ PASS
- has_thumbnail column added to comics: ✓ PASS
- scan_jobs table with all columns: ✓ PASS
- Index idx_scan_jobs_status created: ✓ PASS
- All CRUD functions working: ✓ PASS
- Data migration (processed → has_thumbnail): ✓ PASS

### Commit
- Hash: 461a66d
- Message: feat(db): add scan_jobs table and modify comics for lazy loading

## On-Demand Thumbnail Generation (Wave 2, Task 5)

### Implementation Pattern
Successfully implemented lazy thumbnail generation using threading with timeout:

1. **Race Condition Protection**:
   - Generate to temp file: `{comic_id}_{pid}_{thread_id}_tmp.jpg`
   - Use `os.rename()` for atomic move to final filename
   - Check if final file exists before rename - if so, another thread won the race
   - Clean up temp file if final already exists

2. **Timeout Handling**:
   - Use `thread.join(timeout=10)` instead of signals (POSIX signals don't work in web servers)
   - If timeout: return placeholder image immediately
   - Continue generation in daemon background thread
   - Background thread updates DB on success

3. **Placeholder Image**:
   - Created once on module load: `_placeholder.jpg`
   - 300x450 gray background with "Generating..." text
   - Served on timeout to prevent blocking requests

4. **Database Updates**:
   - Update `has_thumbnail = 1` after successful generation
   - Happens both in foreground (no timeout) and background (timeout) paths

### Key Learning
Threading with timeout is the correct approach for web servers (not signals). The pattern:
```python
thread.start()
thread.join(timeout)
if thread.is_alive():  # timeout
    # spawn daemon thread to continue
```

This ensures requests never block indefinitely while still completing work in background.

## 2026-02-01 - Task 3: Fast Scanner Implementation (COMPLETED)

### Implementation Details
- **New function**: `fast_scan_library_task()` in `scanner.py` (lines 111-303)
- **Directory-only walk**: Uses `os.walk()` with NO archive operations
- **Batch inserts**: 1000 comics at a time using `executemany()`
- **Progress updates**: Every 100 comics processed
- **Scan lock**: Checks `get_running_scan_job()` before starting
- **Two-pass approach**: First pass counts total comics, second pass processes

### Key Features
- **Fast metadata parsing**: Still parses series.json (file read only, no archive ops)
- **NULL pages**: Sets `pages=None` instead of counting (deferred to lazy loading)
- **has_thumbnail=False**: All comics marked without thumbnail initially
- **Identical path logic**: Reused exact same category/subcategory/series detection as original
- **Error handling**: Wraps entire scan in try/except with `complete_scan_job(status='failed')`

### Performance Optimizations
- **No zipfile.ZipFile()** calls (original opened every archive)
- **No rarfile.RarFile()** calls (original opened every archive)
- **No extract_cover_image()** calls (original generated all thumbnails upfront)
- **Batch buffer**: Accumulates 1000 comics before executing `executemany()`
- **Progress interval**: Only updates DB every 100 comics (reduces commit overhead)

### Database Integration
- Creates scan_job entry with `total_comics` from first pass
- Updates progress with `update_scan_progress(job_id, processed_count)`
- Marks completion with `complete_scan_job(job_id, status='completed')`
- On error: `complete_scan_job(job_id, status='failed', errors=str(e))`

### Routes Changes
- Modified `/api/scan` endpoint in `routes/library.py` line 156
- Now calls `fast_scan_library_task()` instead of `scan_library_task(job_id)`
- Removed `create_scan_job()` call from endpoint (function creates its own job)
- Scan lock already implemented via `get_running_scan_job()` check (line 151)

### Key Decisions
- **Preserved original scan**: `scan_library_task()` remains untouched for reference
- **Self-contained job creation**: Fast scan creates its own job_id internally
- **Two-phase counting**: First pass counts total for accurate progress tracking
- **Existing comics skipped**: Checks `SELECT id FROM comics WHERE id = ?` and increments processed_count

### Testing Notes
- Target: 60,000 comics in < 120 seconds
- Expected: ~30 seconds for directory walk only
- Progress visible via `/api/scan/status` endpoint (already implemented in Task 4)
- Concurrent scan protection via database (not just in-memory)

### Commit
- Message: `feat(scanner): implement fast directory-only scan`
- Files: `scanner.py`, `routes/library.py`
