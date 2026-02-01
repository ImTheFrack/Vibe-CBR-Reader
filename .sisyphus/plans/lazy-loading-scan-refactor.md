# Lazy Loading Scanner Refactor - Work Plan

## TL;DR

> **Transform the library scanner from a 16+ hour blocking operation to a 30-second fast scan with on-demand thumbnail generation.**
>
> **Deliverables:**
> - Fast directory-only scan (~30 seconds for 60k comics)
> - On-demand thumbnail generation when comics are first viewed
> - Live scan progress page with polling updates
> - Admin-only Scan Library button in hamburger menu
> - 30-day persistent login with forced authentication
> - Race-condition-safe thumbnail generation
>
> **Estimated Effort:** Medium (~6-8 hours)
> **Parallel Execution:** YES - 3 waves
> **Critical Path:** Database Schema → Fast Scanner → Auth Integration → Progress UI

---

## Context

### Original Request
User has a massive library (2,000+ series, 60,000+ comics) and the current scanner takes 16+ hours because it:
1. Opens every archive TWICE (once for page count, once for thumbnail)
2. Processes everything sequentially before allowing library browsing
3. Provides no visibility into scan progress

### Approach B: Lazy Loading (Selected)
- **Phase 1**: Ultra-fast directory scan (paths only, no archive operations)
- **Phase 2**: Thumbnails generated on-demand when comic is first viewed
- **Phase 3**: Optional background pre-generation for popular series

### Key Decisions
1. ✓ **Admin-only Scan**: Move button to hamburger menu, admin role required
2. ✓ **30-day Login**: Extend cookie expiration from 7 to 30 days, force auth for all
3. ✓ **Live Progress**: Polling-based status page (no WebSockets)
4. ✓ **No Resume**: Fast scan completes quickly enough

---

## Work Objectives

### Core Objective
Transform the scanner to enable near-instant library browsing while deferring expensive operations (thumbnail generation, page counting) until they're actually needed.

### Concrete Deliverables
1. New `scan_jobs` database table for tracking progress
2. Modified `comics` table (nullable `pages`, `has_thumbnail` flag)
3. New `fast_scan_library_task()` function (directory-only)
4. Modified `/api/cover/{comic_id}` endpoint (on-demand generation)
5. New `/api/scan/status` endpoint for progress polling
6. Protected routes requiring authentication
7. Admin-only Scan button in hamburger menu
8. New Scan Status page with live updates
9. 30-day cookie expiration
10. Forced login on app initialization

### Definition of Done
- [ ] Fast scan completes in < 2 minutes for 60k comics
- [ ] Thumbnails generate on-demand without timeouts
- [ ] Progress page updates every 3 seconds during scan
- [ ] Only admins see Scan Library button
- [ ] Non-authenticated users see login modal immediately
- [ ] All existing user data preserved (progress, bookmarks, preferences)

### Must Have
- Backward compatibility with existing thumbnails
- Race-condition handling for concurrent thumbnail requests
- Graceful handling of missing/deleted comic files
- Scan lock to prevent concurrent scans

### Must NOT Have (Guardrails)
- NO changes to reader functionality
- NO WebSocket implementation (polling only)
- NO changes to bookmark/progress systems
- NO file organization changes
- NO database migrations beyond necessary columns
- NO breaking API changes

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (no existing test framework)
- **User wants tests**: Manual verification (complex UI/background tasks)
- **QA approach**: Manual verification with specific test scenarios

### Manual Verification Procedures

**Scenario 1: Fast Scan Performance**
```bash
# Start with empty database
# Trigger scan via API or UI
# Measure time
```
Expected: 60,000 comics scanned in < 120 seconds

**Scenario 2: On-Demand Thumbnail Generation**
1. Clear cache directory
2. Navigate to series with comics
3. Observe thumbnails appearing (may take 1-5s per comic)
4. Refresh page - thumbnails should be instant

**Scenario 3: Admin-Only Scan Button**
1. Login as non-admin user → Scan button should NOT appear
2. Login as admin user → Scan button should appear in hamburger menu
3. Click Scan with Shift → Rescan confirmation should appear

**Scenario 4: Forced Login**
1. Clear cookies / use incognito
2. Navigate to app
3. Login modal should appear automatically
4. Cannot dismiss modal without logging in

**Scenario 5: Live Progress Page**
1. Start a scan
2. Navigate to Scan Status page
3. Observe counters updating every 3 seconds
4. Completion should show "Finished" message

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation):
├── Task 1: Database Schema Changes
└── Task 2: 30-Day Cookie & Forced Login

Wave 2 (Core Logic):
├── Task 3: Fast Scanner Implementation
├── Task 4: Scan Status Tracking System
└── Task 5: On-Demand Thumbnail Generation

Wave 3 (UI & Integration):
├── Task 6: Admin-Only Scan Button
├── Task 7: Scan Progress Page
└── Task 8: Route Protection
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4 | 2 |
| 2 | None | 8 | 1 |
| 3 | 1 | 7 | 4, 5 |
| 4 | 1 | 7 | 3, 5 |
| 5 | 1 | None | 3, 4 |
| 6 | 2 | None | 3, 4, 5 |
| 7 | 3, 4 | None | 6, 8 |
| 8 | 2 | None | 6, 7 |

---

## TODOs

- [ ] 1. Database Schema Changes

  **What to do**:
  - Create `scan_jobs` table with columns: id, started_at, completed_at, status, total_comics, processed_comics, errors (JSON), scan_type
  - Modify `comics` table: make `pages` nullable, add `has_thumbnail` column (BOOLEAN, default FALSE)
  - IMPORTANT: Do NOT rename `processed` column - SQLite has limited ALTER TABLE support. Keep both columns for backward compatibility, or migrate via: 1) Add new column, 2) Copy data, 3) Drop old column in separate migration
  - Add index on `scan_jobs.status` for fast polling queries
  - Create migration script to preserve existing data

  **Must NOT do**:
  - Do NOT delete existing comics data
  - Do NOT change other tables (users, progress, bookmarks, series)

  **Recommended Agent Profile**:
  - **Category**: `quick` (database schema changes are straightforward)
  - **Skills**: `git-master` (for version control of migrations)
  - **Skills Evaluated but Omitted**: `dev-browser` (no UI changes), `playwright` (no testing)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 3, 4 (need schema)
  - **Blocked By**: None

  **References**:
  - `database.py:12-140` - Current schema definitions and init_db()
  - `database.py:189-201` - Session creation pattern (follow for scan_jobs)
  - `scanner.py:26-30` - Comics table columns currently used

  **Acceptance Criteria**:
  - [ ] SQLite schema updated successfully
  - [ ] Existing data preserved (no data loss)
  - [ ] New columns allow NULL for pages
  - [ ] Migration script runs without errors

  **Verification**:
  ```bash
  python -c "from database import init_db; init_db(); print('Schema OK')"
  ```
  Expected: "Schema OK" with no errors

  **Commit**: YES
  - Message: `feat(db): add scan_jobs table and modify comics for lazy loading`
  - Files: `database.py`

- [ ] 2. 30-Day Cookie & Forced Login

  **What to do**:
  - Change `expires_hours=168` to `expires_hours=720` (30 days) in `routes/auth.py:44`
  - Change `max_age=604800` to `max_age=2592000` (30 days) in `routes/auth.py:61`
  - Add `get_current_user` dependency to all public routes that should now require auth (replace `get_optional_user`)
  - Update `static/js/main.js` to show login modal on init if not authenticated
  - Modify `static/js/auth.js:checkAuthStatus` to show modal when `authenticated: false`
  - IMPORTANT: Do NOT modify `get_optional_user` to redirect - API dependencies cannot perform HTTP redirects. Instead, return 401 and let frontend handle it

  **Must NOT do**:
  - Do NOT change password hashing or session token generation
  - Do NOT break existing remember-me functionality
  - Do NOT require re-login for existing valid sessions

  **Recommended Agent Profile**:
  - **Category**: `quick` (straightforward parameter changes)
  - **Skills**: `dev-browser`, `frontend-ui-ux` (for modal integration)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 8 (route protection)
  - **Blocked By**: None

  **References**:
  - `routes/auth.py:35-65` - Login endpoint with cookie settings
  - `dependencies.py:32-48` - get_optional_user function
  - `static/js/auth.js:8-20` - checkAuthStatus function
  - `static/js/main.js:1-20` - App initialization

  **Acceptance Criteria**:
  - [ ] Cookie expires in 30 days (check browser dev tools)
  - [ ] Login modal appears automatically when not authenticated
  - [ ] Cannot dismiss modal without logging in (no close button or click-outside)
  - [ ] Existing valid sessions still work

  **Verification**:
  1. Clear cookies, reload page
  2. Observe: Login modal appears within 1 second
  3. Check cookie: Should show 30-day expiration
  4. Login, close browser, reopen: Should still be logged in

  **Commit**: YES
  - Message: `feat(auth): extend session to 30 days and enforce login`
  - Files: `routes/auth.py`, `dependencies.py`, `static/js/auth.js`, `static/js/main.js`

- [ ] 3. Fast Scanner Implementation

  **What to do**:
  - Create new `fast_scan_library_task()` function in `scanner.py`
  - Directory-only walk using `os.walk()`
  - Extract only: filepath, filename, series name (from path), category, subcategory
  - Skip: opening archives, counting pages, generating thumbnails
  - Use batch inserts (1000 at a time) for database performance
  - Update scan_jobs table with progress every 100 comics
  - Implement scan lock using database: Check for any scan_jobs with status='running' and started_at > datetime('now', '-1 hour') before starting new scan

  **Must NOT do**:
  - Do NOT remove existing `scan_library_task()` (keep for reference/full scan)
  - Do NOT change the file discovery logic (keep same path structure detection)
  - Do NOT skip series.json parsing (do this, it's fast)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-medium` (complex logic, needs careful testing)
  - **Skills**: `git-master`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7 (progress UI needs something to track)
  - **Blocked By**: Task 1 (needs database schema)

  **References**:
  - `scanner.py:108-259` - Current scan_library_task (study but don't modify)
  - `scanner.py:118-131` - Directory walk pattern
  - `scanner.py:142-160` - Series/category/subcategory detection
  - `scanner.py:233-255` - Batch insert pattern

  **Acceptance Criteria**:
  - [ ] Scans 60,000 comics in < 120 seconds
  - [ ] Does not open any archives
  - [ ] Updates scan_jobs table with progress
  - [ ] Prevents concurrent scans (second scan request rejected)
  - [ ] Preserves existing series.json parsing

  **Verification**:
  ```bash
  time curl -X POST http://localhost:8000/api/scan -H "Cookie: session_token=XXX"
  ```
  Expected: Response in < 2 seconds (scan runs in background), completes in < 120s

  **Commit**: YES
  - Message: `feat(scanner): implement fast directory-only scan`
  - Files: `scanner.py`, `routes/library.py`

- [ ] 4. Scan Status Tracking System

  **What to do**:
  - Create `create_scan_job()`, `update_scan_progress()`, `get_scan_status()` functions in `database.py`
  - Create `POST /api/scan` endpoint that creates scan_job entry before starting background task
  - Create `GET /api/scan/status` endpoint that returns current scan progress
  - Modify scanner to update scan_job every 100 comics processed
  - Handle scan completion/failure in scan_job record
  - Add cleanup logic: Mark any scan_jobs with status='running' and started_at < datetime('now', '-1 hour') as 'failed' (stuck scans from crashed server)

  **Must NOT do**:
  - Do NOT use WebSockets (polling only)
  - Do NOT store scan status in memory only (must persist in DB)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `git-master`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7 (UI needs status endpoint)
  - **Blocked By**: Task 1 (needs scan_jobs table)

  **References**:
  - `database.py:189-201` - Pattern for CRUD operations
  - `routes/library.py:14-28` - Current scan endpoints
  - `scanner.py:108-259` - Where to integrate progress updates

  **Acceptance Criteria**:
  - [ ] Scan job created when scan starts
  - [ ] Progress updates every 100 comics
  - [ ] Status endpoint returns: status, total, processed, started_at, completed_at
  - [ ] Completed scans marked as 'completed'
  - [ ] Failed scans marked as 'failed' with error message

  **Verification**:
  ```bash
  # Start scan
curl -X POST http://localhost:8000/api/scan -H "Cookie: session_token=XXX"
  
  # Check status (poll every 3 seconds)
  curl http://localhost:8000/api/scan/status -H "Cookie: session_token=XXX"
  ```
  Expected: JSON with increasing processed count, eventually status: 'completed'

  **Commit**: YES
  - Message: `feat(api): add scan status tracking and progress endpoints`
  - Files: `database.py`, `routes/library.py`

- [ ] 5. On-Demand Thumbnail Generation

  **What to do**:
  - Modify `GET /api/cover/{comic_id}` in `routes/library.py`
  - If thumbnail exists in cache: serve it (current behavior)
  - If thumbnail missing: 
    - Look up comic path from database
    - Extract first image from archive
    - Generate thumbnail using PIL
    - Save to cache
    - Update `has_thumbnail` flag in database
    - Serve thumbnail
  - Add atomic file creation to prevent race conditions: Generate to temp file with unique name (include PID/thread ID), then rename atomically to final name. If final file already exists, skip generation.
  - Add timeout handling: Use threading with timeout instead of signals (signals incompatible with web servers). If generation takes > 10 seconds, return placeholder image and continue generation in background thread.

  **Must NOT do**:
  - Do NOT change thumbnail size or quality
  - Do NOT move thumbnails to database (keep filesystem)
  - Do NOT block the request indefinitely

  **Recommended Agent Profile**:
  - **Category**: `unspecified-medium` (complex file operations, race conditions)
  - **Skills**: `git-master`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None (independent)
  - **Blocked By**: Task 1 (needs has_thumbnail column)

  **References**:
  - `routes/library.py:38-42` - Current cover endpoint
  - `scanner.py:21-70` - extract_cover_image function (reuse this)
  - `database.py:26` - processed column (becomes has_thumbnail)

  **Acceptance Criteria**:
  - [ ] Missing thumbnails generated on first request
  - [ ] Thumbnails saved to cache directory
  - [ ] has_thumbnail flag updated in database
  - [ ] Race condition handled (no duplicate generation)
  - [ ] Timeout after 10 seconds with placeholder image
  - [ ] Subsequent requests serve cached thumbnail instantly

  **Verification**:
  ```bash
  # Clear cache
  rm -rf cache/*
  
  # Request cover (should generate)
  time curl http://localhost:8000/api/cover/ABC123 -o thumb1.jpg
  # Expected: 1-5 seconds
  
  # Request same cover again (should be instant)
  time curl http://localhost:8000/api/cover/ABC123 -o thumb2.jpg
  # Expected: < 100ms
  ```

  **Commit**: YES
  - Message: `feat(api): implement on-demand thumbnail generation`
  - Files: `routes/library.py`, `scanner.py`

- [ ] 6. Admin-Only Scan Button

  **What to do**:
  - Remove Scan button from `index.html` line 62-65
  - Modify `static/js/auth.js:updateAuthUI()` to conditionally show Scan button
  - Add logic: if `state.currentUser.role === 'admin'`, add Scan menu item
  - Preserve Shift+Click rescan functionality (already implemented)
  - Add visual indicator that Scan is admin-only (optional: icon or color)

  **Must NOT do**:
  - Do NOT remove rescan functionality
  - Do NOT change the button behavior (just visibility)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` (UI changes)
  - **Skills**: `frontend-ui-ux`, `dev-browser`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 2 (needs authentication state)

  **References**:
  - `index.html:62-65` - Current Scan button (remove from here)
  - `static/js/auth.js:86-118` - updateAuthUI function (add button here)
  - `static/js/auth.js:94-106` - Logged-in user menu section
  - `static/js/library.js:26-90` - scanLibrary function (keep as-is)

  **Acceptance Criteria**:
  - [ ] Scan button removed from static HTML
  - [ ] Scan button appears in menu for admin users only
  - [ ] Non-admin users do not see Scan option
  - [ ] Shift+Click rescan still works for admins

  **Verification**:
  1. Login as reader → Open hamburger menu → No Scan option
  2. Login as admin → Open hamburger menu → Scan option visible
  3. Click Scan → Normal scan starts
  4. Shift+Click Scan → Rescan confirmation appears

  **Commit**: YES
  - Message: `feat(ui): make scan button admin-only in hamburger menu`
  - Files: `index.html`, `static/js/auth.js`

- [ ] 7. Scan Progress Page

  **What to do**:
  - Create new view in `index.html` (or reuse existing structure)
  - Create `static/js/scan-status.js` module
  - Implement polling: every 3 seconds call `GET /api/scan/status`
  - Display: status, progress bar, comics processed / total, started time, ETA
  - Show completion message when done
  - Add link/button to access this page from hamburger menu (admin only)
  - Handle case: no scan running (show "No active scan")

  **Must NOT do**:
  - Do NOT use WebSockets
  - Do NOT poll more frequently than every 3 seconds
  - Do NOT show progress for completed scans older than 1 hour

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`, `dev-browser`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 4 (need scanner and status API)

  **References**:
  - `index.html:162-178` - Recent view pattern (follow for new view)
  - `static/js/library.js:1-20` - Module pattern to follow
  - `static/js/main.js:1-10` - Export pattern

  **Acceptance Criteria**:
  - [ ] New "Scan Status" view accessible from menu
  - [ ] Polls every 3 seconds during active scan
  - [ ] Shows progress bar with percentage
  - [ ] Displays "X of Y comics processed"
  - [ ] Shows "Scan complete" when finished
  - [ ] Accessible only to admin users

  **Verification**:
  1. Start a scan
  2. Navigate to Scan Status page
  3. Observe: Progress updates every 3 seconds
  4. Wait for completion: Shows "Finished" message

  **Commit**: YES
  - Message: `feat(ui): add scan progress page with live updates`
  - Files: `index.html`, `static/js/scan-status.js`, `static/js/main.js`, `static/js/auth.js`

- [ ] 8. Route Protection

  **What to do**:
  - Audit all routes in `routes/` directory
  - Replace `get_optional_user` with `get_current_user` for all routes that should require auth:
    - `/api/books` (library listing)
    - `/api/series/*` (series details)  
    - `/api/cover/*` (thumbnails) - Use `get_current_user` but still allow public thumbnails if desired, or protect all
    - `/api/read/*` (comic reading)
    - All user routes (`/api/progress`, `/api/preferences`, `/api/bookmarks`)
  - IMPORTANT: Do NOT use `get_optional_user` for protected routes. Use `get_current_user` which raises 401 if not authenticated.
  - Frontend already handles 401 by showing login modal (from Task 2)
  - Public endpoints that remain unprotected: `/api/auth/login`, `/api/auth/register`, `/` (main page)

  **Must NOT do**:
  - Do NOT break the login endpoint itself (needs to be accessible)
  - Do NOT change API response formats

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `git-master`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 2 (needs auth enforcement logic)

  **References**:
  - `routes/library.py:30-62` - Current optional auth routes
  - `routes/series.py:26-93` - Series detail route
  - `dependencies.py:5-24` - get_current_user vs get_optional_user

  **Acceptance Criteria**:
  - [ ] All API routes require authentication
  - [ ] Unauthenticated requests return 401
  - [ ] Login endpoint still works (for initial auth)
  - [ ] Frontend handles 401 by showing login modal

  **Verification**:
  ```bash
  # Without cookie
curl http://localhost:8000/api/books
  # Expected: 401 Unauthorized
  
  # With valid cookie
curl http://localhost:8000/api/books -H "Cookie: session_token=XXX"
  # Expected: 200 with book list
  ```

  **Commit**: YES
  - Message: `feat(api): require authentication for all library routes`
  - Files: `routes/library.py`, `routes/series.py`, `routes/users.py`

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `feat(db): add scan_jobs table and modify comics for lazy loading` | `database.py` |
| 2 | `feat(auth): extend session to 30 days and enforce login` | `routes/auth.py`, `dependencies.py`, `static/js/auth.js`, `static/js/main.js` |
| 3 | `feat(scanner): implement fast directory-only scan` | `scanner.py`, `routes/library.py` |
| 4 | `feat(api): add scan status tracking and progress endpoints` | `database.py`, `routes/library.py` |
| 5 | `feat(api): implement on-demand thumbnail generation` | `routes/library.py`, `scanner.py` |
| 6 | `feat(ui): make scan button admin-only in hamburger menu` | `index.html`, `static/js/auth.js` |
| 7 | `feat(ui): add scan progress page with live updates` | `index.html`, `static/js/scan-status.js`, `static/js/main.js`, `static/js/auth.js` |
| 8 | `feat(api): require authentication for all library routes` | `routes/library.py`, `routes/series.py`, `routes/users.py` |

---

## Success Criteria

### Performance Benchmarks
- Fast scan: 60,000 comics in < 120 seconds
- On-demand thumbnail: < 5 seconds for first request
- Cached thumbnail: < 100ms
- Progress page update: Every 3 seconds

### Functional Verification
- [ ] All users must login to access library
- [ ] Session persists for 30 days
- [ ] Only admins see Scan Library button
- [ ] Scan shows live progress
- [ ] Thumbnails generate on-demand
- [ ] No data loss (existing progress, bookmarks preserved)

### Error Handling
- [ ] Missing comic files handled gracefully
- [ ] Corrupt archives show placeholder
- [ ] Concurrent scans rejected with clear message
- [ ] Thumbnail generation timeout handled
- [ ] Database errors logged but don't crash scanner

---

## Risk Mitigation

### Race Condition: Concurrent Thumbnail Generation
**Mitigation**: Atomic file creation with temp file + rename pattern
**Implementation**: 
1. Generate thumbnail to temp file: `{comic_id}_{pid}_{thread_id}.tmp.jpg`
2. Use atomic `os.rename()` to move to final location: `{comic_id}.jpg`
3. If final file exists before rename, delete temp and use existing file
4. This prevents TOCTOU (Time-of-check to time-of-use) race conditions

### Database Lock Contention
**Mitigation**: Batch inserts (1000 at a time), use WAL mode if needed
**Implementation**: 
1. Use `BEGIN IMMEDIATE` for transactions
2. Commit every 1000 rows during fast scan
3. Enable WAL mode on SQLite for better concurrency: `PRAGMA journal_mode=WAL`

### Timeout During Thumbnail Generation
**Mitigation**: 10-second timeout with placeholder fallback
**Implementation**: 
1. Use `threading.Thread` with `join(timeout=10)` instead of signals (signals incompatible with web servers)
2. If timeout exceeded, return placeholder image immediately
3. Continue generation in daemon thread (thumbnail will be available on next request)

### Disk Space Exhaustion
**Mitigation**: Monitor cache directory size, implement LRU eviction (future enhancement)
**Implementation**: Log warning if cache > 10GB, delete oldest thumbnails by mtime

### Concurrent Scan Requests
**Mitigation**: Database-based scan lock with automatic timeout
**Implementation**: 
1. Before starting scan, check: `SELECT * FROM scan_jobs WHERE status='running' AND started_at > datetime('now', '-1 hour')`
2. If found, reject new scan with "Scan already in progress" message
3. On server startup, auto-mark any old 'running' scans as 'failed' (cleanup crashed scans)

---

## Migration Plan

### Database Migration
1. Backup existing `comics.db`
2. Run schema updates:
   - Create `scan_jobs` table (new)
   - Modify `comics` table: 
     - Make `pages` nullable: `ALTER TABLE comics ALTER COLUMN pages DROP NOT NULL` (or recreate table if SQLite version < 3.35.0)
     - Add `has_thumbnail` column: `ALTER TABLE comics ADD COLUMN has_thumbnail BOOLEAN DEFAULT FALSE`
3. Migrate existing data:
   - Keep existing `pages` values (backfill NULLs on first read if needed)
   - Copy: `UPDATE comics SET has_thumbnail = TRUE WHERE processed = TRUE`
   - Drop old column in future migration (not critical for functionality)
4. Enable WAL mode for better concurrency: `PRAGMA journal_mode=WAL`
5. Verify data integrity

### Rollback Plan
If issues occur:
1. Restore `comics.db` from backup
2. Revert code changes via git
3. Clear cache directory if corrupted
4. Restart server

---

## Future Enhancements (Out of Scope)

- Background pre-generation of popular series thumbnails
- LRU cache eviction for thumbnail directory
- Resume interrupted scans
- WebSocket real-time updates (replace polling)
- Parallel thumbnail generation workers
- Thumbnail quality/size preferences
