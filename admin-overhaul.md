# Admin Page Overhaul — 4 Work Items

## TL;DR

> **Quick Summary**: Consolidate scanning, thumbnail configuration, user approval, reading stats, and scan status onto a restructured "Administration" page. Adds 4 scan types, configurable thumbnail format/quality/resolution with "Pick Best" mode, a user approval gate, reading stat columns, and moves the broken scan-status view inline.
>
> **Deliverables**:
> - DB migration v7 (admin_settings table, comics.thumbnail_ext, users.approved)
> - 2 new scanner functions (thumbnail_rescan_task, metadata_rescan_task)
> - Modified save_thumbnail with format/quality/resolution support + "Pick Best"
> - Admin settings API (GET/PUT /api/admin/settings)
> - User approval flow (register gate, login gate, approve endpoint)
> - Reading stats JOIN in admin users endpoint
> - Rebuilt admin page HTML/CSS with 3 sections: Library Metadata, User Management, Sequence Gaps
> - Inline scan status panel (replaces broken separate view)
> - Removed old scan-status view, scan/rescan menu items
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 2 → Task 5 → Task 6 → Task 9 → Task 10

---

## Context

### Original Request
Implement 4 work items for a comic book reader web app: (1) Admin Page Library Metadata section with 4 scan buttons + thumbnail settings, (2) Approve New Users toggle, (3) Time Read & Comics Read stats in admin user table, (4) Move broken scan status view inline to admin page.

### Interview Summary
**Key Discussions**:
- User provided extremely detailed specs for all 4 items including exact DB columns, API endpoints, frontend behavior
- Implementation order specified: DB first → backend → HTML/CSS → frontend features → cleanup → testing
- Thumbnail "Pick Best" mode: try WebP, PNG, JPG in memory via BytesIO, save smallest
- Aspect ratio presets: American (663:1024), Bunko (128:182), Tankobon (114:172), ISO B4 (257:364), MAL (9:14), Mangadex (512:713)
- Scan status: inline collapsible panel that auto-expands when scan is active
- All scan triggers move from hamburger menu to admin page

**Research Findings**:
- Current `save_thumbnail()` in `scanner/archives.py:10` hardcodes WebP/70%/300x450
- `get_thumbnail_path()` in `config.py:44` hardcodes `.webp` extension in path
- `_process_single_comic()` in `archives.py:61` calls `save_thumbnail` without format params
- On-demand generation in `routes/library.py:113` (`generate_thumbnail_with_timeout`) also hardcodes format
- `get_cover` endpoint in `routes/library.py:319` serves `FileResponse(cache_path)` — needs to discover correct extension
- `scanLibrary()` function lives in `library.js:137`, imported in `main.js:9`
- `showScanStatus()` in `scan-status.js:23` navigates to `#/scan`
- `scan` route case in `main.js:187` calls `showScanStatus()` + `startScanPolling()`
- Admin user creation in `server.py:45` (`create_default_admin`) — first user is always admin
- `database.py` is a barrel re-export: `from db import *`
- DB migration pattern: increment `SCHEMA_VERSION`, add `if current_version < N:` block with try/except ALTER TABLE
- Admin routes use `Depends(get_admin_user)` from `dependencies.py`
- Registration in `routes/auth.py:22` forces `role="reader"` regardless of input
- `get_all_users()` in `db/users.py` does simple SELECT, no JOINs

### Gap Analysis (Self-Review)
**Gaps Identified and Resolved**:
1. **Old thumbnail cleanup**: When format changes, old `.webp` files remain. Plan includes cache purge as part of thumbnail rescan, and `get_thumbnail_path` now checks `thumbnail_ext` column.
2. **`get_cover` endpoint format detection**: Currently hardcodes `.webp` path. Modified to read `thumbnail_ext` from comics table.
3. **`generate_thumbnail_with_timeout` propagation**: Must pass format/quality/size through the timeout wrapper to `extract_cover_image` and `save_thumbnail`.
4. **First user approval bypass**: `create_default_admin()` in `server.py` creates admin; existing users get `approved=1` via DEFAULT. New registrations check `require_approval` setting.
5. **Router cleanup**: `case 'scan'` in `main.js:187` must redirect to `#/admin` instead of showing removed view.
6. **scan_type for new scans**: New scan types need distinct `scan_type` values ('thumbnails', 'metadata') for job tracking.
7. **Scanner `__init__.py` exports**: New tasks need to be exported from `scanner/__init__.py`.
8. **`auth.js` check endpoint**: `/api/auth/check` should return `approved` status so frontend can display appropriate messages.

---

## Work Objectives

### Core Objective
Consolidate all admin functionality onto a single "Administration" page with Library Metadata controls (4 scan types + thumbnail settings), User Management (with approval flow and reading stats), and inline scan status.

### Concrete Deliverables
- `db/connection.py`: Migration v7 — `admin_settings` table, `comics.thumbnail_ext` column, `users.approved` column
- `db/settings.py`: New module — CRUD for admin_settings key-value table
- `scanner/tasks.py`: New functions `thumbnail_rescan_task()`, `metadata_rescan_task()`
- `scanner/archives.py`: Modified `save_thumbnail()` with format/quality/size params + "Pick Best"
- `scanner/__init__.py`: Export new tasks
- `config.py`: Modified `get_thumbnail_path()` to accept extension parameter
- `routes/admin.py`: New endpoints — settings GET/PUT, scan/thumbnails POST, scan/metadata POST, approve user PUT, modified list_users with stats
- `routes/auth.py`: Modified register (approval gate), modified login (approved check)
- `routes/library.py`: Modified `get_cover` and `generate_thumbnail_with_timeout` to use settings
- `index.html`: Rebuilt `view-admin` HTML, removed `view-scan-status` HTML
- `static/js/admin.js`: Complete rewrite — Library Metadata section, scan buttons, thumbnail settings UI, inline scan status, user management with stats + approval
- `static/js/auth.js`: Modified `updateAuthUI()` — remove scan items, rename "User Management" to "Administration"
- `static/js/main.js`: Remove scan route handling, update admin route
- `static/js/scan-status.js`: Refactored to work with admin page elements (or merged into admin.js)
- `static/js/router.js`: Remove or redirect `scan` route

### Definition of Done
- [x] All 4 scan types work from admin page (incremental, full rescan, thumbnail-only, metadata-only)
- [x] Thumbnail settings persist and take effect on next scan
- [x] "Pick Best" format produces smallest file among WebP/PNG/JPG
- [x] User approval toggle works: new registrations gated when enabled
- [x] Reading stats (comics read, time read) display in admin user table
- [x] Scan status displays inline on admin page with auto-expand
- [x] Old scan-status view completely removed
- [x] Hamburger menu shows only "Administration" for admin items (no Scan Library, no Scan Status)

### Must Have
- Admin-only access on all new endpoints
- Confirmation modal before Full Re-Scan (destructive)
- Quality slider disabled when format is PNG
- Existing thumbnails preserved until explicit thumbnail rescan
- All existing users auto-approved on migration (DEFAULT 1)
- First admin user always auto-approved

### Must NOT Have (Guardrails)
- Do NOT auto-regenerate all thumbnails when settings change (only on explicit thumbnail rescan)
- Do NOT add new pages or views — everything goes on the existing admin page
- Do NOT change the reading/viewer functionality
- Do NOT modify the library browsing experience
- Do NOT add WebSocket support — keep the 3-second polling pattern
- Do NOT abstract the inline styles to CSS classes (match existing codebase conventions)
- Do NOT add a third-party UI component library
- Do NOT change the hash routing pattern
- Do NOT modify comics that are currently being scanned (check for running job before settings changes)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: NO (no test framework configured)
- **Automated tests**: NO
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: DB Migration v7 [no dependencies]
│
Wave 2 (After Wave 1):
├── Task 2: Thumbnail engine refactor [depends: 1]
├── Task 3: New scanner tasks [depends: 1]
├── Task 4: Admin settings API [depends: 1]
├── Task 5: User approval backend [depends: 1]
├── Task 6: Reading stats backend [depends: 1]
│
Wave 3 (After Wave 2):
├── Task 7: Admin page HTML restructure [depends: 1]
├── Task 8: Feature 1 frontend — scan buttons + thumb settings + scan status [depends: 2,3,4,7]
├── Task 9: Feature 2 frontend — approval UI [depends: 5,7]
├── Task 10: Feature 3 frontend — stats columns [depends: 6,7]
├── Task 11: Bugfix 4 — remove old scan status + menu cleanup [depends: 8]
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|-----------|--------|---------------------|
| 1 | None | 2,3,4,5,6,7 | None (first) |
| 2 | 1 | 8 | 3,4,5,6 |
| 3 | 1 | 8 | 2,4,5,6 |
| 4 | 1 | 8 | 2,3,5,6 |
| 5 | 1 | 9 | 2,3,4,6 |
| 6 | 1 | 10 | 2,3,4,5 |
| 7 | 1 | 8,9,10 | 2,3,4,5,6 |
| 8 | 2,3,4,7 | 11 | 9,10 |
| 9 | 5,7 | None | 8,10 |
| 10 | 6,7 | None | 8,9 |
| 11 | 8 | None | 9,10 |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Approach |
|------|-------|---------------------|
| 1 | 1 | Single task, DB migration |
| 2 | 2,3,4,5,6 | 5 parallel tasks (all backend, all depend only on Task 1) |
| 3 | 7,8,9,10,11 | Task 7 first (HTML structure), then 8,9,10 parallel, then 11 |

---

## TODOs

---

- [x] 1. Database Migration v7 — admin_settings table, comics.thumbnail_ext, users.approved

  **What to do**:
  - In `db/connection.py`:
    - Increment `SCHEMA_VERSION` from 6 to 7
    - Add `CREATE TABLE IF NOT EXISTS admin_settings` in `init_db()`:
      ```sql
      CREATE TABLE IF NOT EXISTS admin_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
      ```
    - Add migration block `if current_version < 7:`:
      - `ALTER TABLE comics ADD COLUMN thumbnail_ext TEXT DEFAULT 'webp'`
      - `ALTER TABLE users ADD COLUMN approved BOOLEAN DEFAULT 1`
      - Seed default admin_settings values:
        - `thumb_quality` = `70`
        - `thumb_ratio` = `9:14` (MAL Preferred)
        - `thumb_width` = `225`
        - `thumb_height` = `350`
        - `thumb_format` = `webp`
        - `require_approval` = `0`
      - Use `INSERT OR IGNORE INTO admin_settings (key, value)` for idempotency
    - Update the `CREATE TABLE IF NOT EXISTS comics` statement to include `thumbnail_ext TEXT DEFAULT 'webp'`
    - Update the `CREATE TABLE IF NOT EXISTS users` statement to include `approved BOOLEAN DEFAULT 1`
  - Create new file `db/settings.py`:
    - `get_setting(key: str, default: str = None) -> Optional[str]` — SELECT from admin_settings
    - `set_setting(key: str, value: str) -> None` — INSERT OR REPLACE into admin_settings
    - `get_all_settings() -> Dict[str, str]` — SELECT all key-value pairs
    - `get_thumbnail_settings() -> Dict[str, Any]` — returns parsed dict: `{quality: int, ratio: str, width: int, height: int, format: str}`
  - Update `db/__init__.py`:
    - Add import: `from .settings import get_setting, set_setting, get_all_settings, get_thumbnail_settings`

  **Must NOT do**:
  - Do NOT drop any existing tables or columns
  - Do NOT change existing migration blocks (< 1 through < 6)
  - Do NOT set approved=0 for existing users (DEFAULT 1 handles this)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commit of migration changes

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `db/connection.py:7` — `SCHEMA_VERSION = 6` (increment to 7)
  - `db/connection.py:41-43` — Migration version check pattern: `current_version = conn.execute('PRAGMA user_version').fetchone()[0]` then `if current_version < N:`
  - `db/connection.py:44-49` — ALTER TABLE with try/except pattern for idempotent migrations
  - `db/connection.py:390-420` — Migration 6 (multi-library) as most recent migration example: CREATE TABLE + ALTER TABLE + seed data
  - `db/connection.py:422-423` — Version update pattern: `conn.execute(f'PRAGMA user_version = {SCHEMA_VERSION}')`

  **API/Type References**:
  - `db/users.py:1-10` — Module structure pattern for new `db/settings.py`
  - `db/__init__.py:1-22` — Barrel export pattern to add settings imports

  **WHY Each Reference Matters**:
  - `connection.py:7` — This is the exact line to change the version number
  - `connection.py:390-420` — The most recent migration is the best template; it shows the CREATE TABLE + ALTER TABLE + seed data pattern in one block
  - `db/__init__.py` — Must add exports here so `from database import get_setting` works via the `database.py` barrel file (`from db import *`)

  **Acceptance Criteria**:
  - [ ] `SCHEMA_VERSION` is 7 in `db/connection.py`
  - [ ] `admin_settings` table exists after `init_db()` runs
  - [ ] `comics` table has `thumbnail_ext` column with DEFAULT 'webp'
  - [ ] `users` table has `approved` column with DEFAULT 1
  - [ ] Default settings seeded: thumb_quality=70, thumb_ratio=9:14, thumb_width=225, thumb_height=350, thumb_format=webp, require_approval=0
  - [ ] `db/settings.py` exists with 4 functions: `get_setting`, `set_setting`, `get_all_settings`, `get_thumbnail_settings`
  - [ ] `from database import get_setting, set_setting, get_all_settings, get_thumbnail_settings` works

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Database migration creates new table and columns
    Tool: Bash (python)
    Preconditions: Server not running, comics.db may or may not exist
    Steps:
      1. python -c "from db.connection import init_db; init_db(); from db.connection import get_db_connection; conn = get_db_connection(); print('version:', conn.execute('PRAGMA user_version').fetchone()[0]); print('admin_settings:', conn.execute('SELECT * FROM admin_settings').fetchall()); print('comics cols:', [d[1] for d in conn.execute('PRAGMA table_info(comics)').fetchall()]); print('users cols:', [d[1] for d in conn.execute('PRAGMA table_info(users)').fetchall()]); conn.close()"
      2. Assert: version is 7
      3. Assert: admin_settings has 6 rows (thumb_quality, thumb_ratio, thumb_width, thumb_height, thumb_format, require_approval)
      4. Assert: 'thumbnail_ext' in comics columns
      5. Assert: 'approved' in users columns
    Expected Result: All assertions pass
    Evidence: Terminal output captured

  Scenario: Settings module CRUD operations work
    Tool: Bash (python)
    Preconditions: init_db() has been called
    Steps:
      1. python -c "from db.settings import get_setting, set_setting, get_all_settings, get_thumbnail_settings; print('quality:', get_setting('thumb_quality')); set_setting('thumb_quality', '85'); print('updated:', get_setting('thumb_quality')); print('all:', get_all_settings()); ts = get_thumbnail_settings(); print('thumb settings:', ts); assert ts['quality'] == 85; assert ts['format'] == 'webp'; print('OK')"
      2. Assert: output shows quality: 70, updated: 85, and thumb settings dict
      3. Assert: final line is "OK"
    Expected Result: All CRUD operations work, get_thumbnail_settings returns parsed dict
    Evidence: Terminal output captured

  Scenario: Migration is idempotent (running twice doesn't error)
    Tool: Bash (python)
    Preconditions: Database already migrated to v7
    Steps:
      1. python -c "from db.connection import init_db; init_db(); init_db(); print('OK')"
      2. Assert: No errors, prints "OK"
    Expected Result: Second call succeeds without errors
    Evidence: Terminal output captured
  ```

  **Commit**: YES
  - Message: `feat(db): add migration v7 — admin_settings table, thumbnail_ext and approved columns`
  - Files: `db/connection.py`, `db/settings.py`, `db/__init__.py`
  - Pre-commit: `python -c "from db.connection import init_db; init_db(); print('migration OK')"`

---

- [x] 2. Thumbnail Engine Refactor — format, quality, resolution support + "Pick Best"

  **What to do**:
  - In `config.py`:
    - Modify `get_thumbnail_path(comic_id: str, ext: str = 'webp') -> Optional[str]`:
      - Change the return from `f"{comic_id}.webp"` to `f"{comic_id}.{ext}"`
      - Accept `ext` parameter (without dot prefix)
  - In `scanner/archives.py`:
    - Modify `save_thumbnail(f_img, comic_id, item_name, target_width=225, target_height=350, fmt='webp', quality=70)`:
      - Replace hardcoded `(target_size, target_size * 1.5)` with `(target_width, target_height)`
      - Implement format handling:
        - `'webp'`: Save as WEBP with quality param, optimize=True
        - `'jpg'`: Save as JPEG with quality param, optimize=True
        - `'png'`: Save as PNG with optimize=True (ignore quality)
        - `'best'`: Try all 3 formats in `io.BytesIO`, compare `.tell()` sizes, save smallest
      - For 'best' mode: save to BytesIO for each format, pick smallest, then write to disk
      - Return tuple `(success: bool|str, chosen_ext: str)` — the chosen extension (important for 'best' mode)
      - Update `get_thumbnail_path` call to pass the chosen extension
    - Modify `extract_cover_image(filepath, comic_id, target_width=225, target_height=350, fmt='webp', quality=70)`:
      - Pass all params through to `save_thumbnail`
      - Return `(success, chosen_ext)` tuple
    - Modify `_process_single_comic(comic_id, filepath, thumb_width=225, thumb_height=350, thumb_fmt='webp', thumb_quality=70)`:
      - Accept thumbnail settings as parameters
      - Pass them to `save_thumbnail`
      - Store `chosen_ext` in result dict: `result['thumb_ext'] = chosen_ext`
  - In `scanner/tasks.py`:
    - Modify `process_library_task(job_id=None)`:
      - At start of function, load thumbnail settings: `from database import get_thumbnail_settings; ts = get_thumbnail_settings()`
      - Pass settings to `_process_single_comic`: `executor.submit(_process_single_comic, comic['id'], comic['path'], ts['width'], ts['height'], ts['format'], ts['quality'])`
      - After processing each comic, update `thumbnail_ext` in the DB update buffer:
        - Change update buffer tuple to include `thumb_ext`
        - Change executemany UPDATE to include `thumbnail_ext = ?`
  - In `routes/library.py`:
    - Modify `get_cover` endpoint:
      - Query `thumbnail_ext` from comics table: `SELECT path, thumbnail_ext FROM comics WHERE id = ?`
      - Pass ext to `get_thumbnail_path(comic_id, ext or 'webp')`
    - Modify `generate_thumbnail_with_timeout`:
      - Load thumbnail settings from DB
      - Pass format/quality/size through to `extract_cover_image`
      - After generation, update `comics.thumbnail_ext` with the chosen extension
  - In `scanner/__init__.py`:
    - Update `extract_cover_image` import (signature changed but name same, no change needed)

  **Must NOT do**:
  - Do NOT auto-regenerate existing thumbnails — only new/changed comics get new settings
  - Do NOT break the existing `_process_single_comic` return dict structure (only add to it)
  - Do NOT change the cache directory structure (`./cache/{first_char}/`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`git-master`]
    - `git-master`: For atomic commit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `scanner/archives.py:10-26` — Current `save_thumbnail()` implementation (hardcoded WebP/70/300x450)
  - `scanner/archives.py:28-59` — Current `extract_cover_image()` (passes target_size to save_thumbnail)
  - `scanner/archives.py:61-112` — Current `_process_single_comic()` (calls save_thumbnail, returns result dict)
  - `config.py:44-55` — Current `get_thumbnail_path()` (hardcodes `.webp`)
  - `scanner/tasks.py:218-269` — Current `process_library_task()` Phase 2 batch processing with ThreadPoolExecutor
  - `scanner/tasks.py:256` — Current DB update executemany: `'UPDATE comics SET pages = ?, processed = ?, has_thumbnail = ? WHERE id = ?'`
  - `routes/library.py:113-188` — `generate_thumbnail_with_timeout()` (calls `extract_cover_image` with hardcoded params)
  - `routes/library.py:319-367` — `get_cover` endpoint (uses `get_thumbnail_path` with just comic_id)

  **WHY Each Reference Matters**:
  - `archives.py:10-26` — THE function to modify; shows current PIL save pattern
  - `archives.py:61-112` — Must add params without breaking the result dict structure used by `process_library_task`
  - `config.py:44-55` — Path generation must change to dynamic extension
  - `tasks.py:256` — The executemany UPDATE SQL must add `thumbnail_ext` to the SET clause
  - `library.py:319-367` — Cover serving must look up comic's `thumbnail_ext` to find the right file

  **Acceptance Criteria**:
  - [ ] `save_thumbnail` accepts format, quality, width, height params
  - [ ] `save_thumbnail` with `fmt='best'` tries WebP/PNG/JPG and saves smallest
  - [ ] `get_thumbnail_path` accepts ext parameter, generates correct path
  - [ ] `_process_single_comic` result dict includes `thumb_ext` key
  - [ ] `process_library_task` loads settings from DB and passes to workers
  - [ ] `comics.thumbnail_ext` updated after thumbnail generation
  - [ ] `get_cover` endpoint reads `thumbnail_ext` from DB for path lookup

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: save_thumbnail generates correct formats
    Tool: Bash (python)
    Preconditions: A sample image file exists (create one with PIL)
    Steps:
      1. python -c "
         from PIL import Image; import io, os
         img = Image.new('RGB', (800, 1200), (128, 64, 32))
         buf = io.BytesIO(); img.save(buf, 'PNG'); buf.seek(0)
         from scanner.archives import save_thumbnail
         # Test WebP
         r1 = save_thumbnail(buf, 'test_webp', 'test.png', target_width=225, target_height=350, fmt='webp', quality=70)
         print('webp result:', r1)
         buf.seek(0)
         # Test best
         r2 = save_thumbnail(buf, 'test_best', 'test.png', target_width=225, target_height=350, fmt='best', quality=70)
         print('best result:', r2)
         # Check files exist
         from config import get_thumbnail_path
         p1 = get_thumbnail_path('test_webp', 'webp')
         print('webp exists:', os.path.exists(p1))
         # Clean up
         for f in [p1]: os.remove(f) if os.path.exists(f) else None
         print('OK')
         "
      2. Assert: webp result is (True, 'webp')
      3. Assert: best result is (True, '<some_ext>') where ext is webp, png, or jpg
      4. Assert: webp file exists at expected path
    Expected Result: Both formats generate valid thumbnails
    Evidence: Terminal output captured

  Scenario: get_thumbnail_path generates extension-aware paths
    Tool: Bash (python)
    Steps:
      1. python -c "from config import get_thumbnail_path; p1 = get_thumbnail_path('abc123', 'webp'); p2 = get_thumbnail_path('abc123', 'png'); p3 = get_thumbnail_path('abc123', 'jpg'); print(p1, p2, p3); assert p1.endswith('abc123.webp'); assert p2.endswith('abc123.png'); assert p3.endswith('abc123.jpg'); print('OK')"
      2. Assert: Paths end with correct extensions
    Expected Result: Extension parameter works correctly
    Evidence: Terminal output
  ```

  **Commit**: YES
  - Message: `feat(scanner): support configurable thumbnail format, quality, and resolution with Pick Best mode`
  - Files: `config.py`, `scanner/archives.py`, `scanner/tasks.py`, `routes/library.py`
  - Pre-commit: `python -c "from scanner.archives import save_thumbnail; from config import get_thumbnail_path; print('imports OK')"`

---

- [x] 3. New Scanner Tasks — thumbnail_rescan_task and metadata_rescan_task

  **What to do**:
  - In `scanner/tasks.py`:
    - Add `thumbnail_rescan_task()`:
      1. Check for running scan job (abort if one exists)
      2. Create scan job with `scan_type='thumbnails'`
      3. Delete all files in `./cache/` subdirectories (but not `_placeholder.webp`)
      4. Reset all comics: `UPDATE comics SET has_thumbnail = 0, thumbnail_ext = NULL`
      5. Load thumbnail settings from `get_thumbnail_settings()`
      6. Call `process_library_task(job_id)` — this regenerates all thumbnails using settings
    - Add `metadata_rescan_task()`:
      1. Check for running scan job (abort if one exists)
      2. Create scan job with `scan_type='metadata'`
      3. Walk COMICS_DIR looking for `series.json` files
      4. For each series.json found, call `parse_series_json()`
      5. Match to existing series in DB by directory path / series name
      6. Call `create_or_update_series()` with fresh metadata
      7. Update `scan_jobs` progress as it processes
      8. Complete the scan job
      9. Invalidate tag cache
  - In `scanner/__init__.py`:
    - Add imports: `from .tasks import thumbnail_rescan_task, metadata_rescan_task`
  - In `routes/admin.py`:
    - Add new endpoint `POST /api/scan/thumbnails`:
      - Requires `get_admin_user`
      - Checks for running scan job (409 if exists)
      - Runs `thumbnail_rescan_task` as background task
      - Returns `{"message": "Thumbnail rescan started"}`
    - Add new endpoint `POST /api/scan/metadata`:
      - Requires `get_admin_user`
      - Checks for running scan job (409 if exists)
      - Runs `metadata_rescan_task` as background task
      - Returns `{"message": "Metadata rescan started"}`
    - Move scan-related endpoints from `routes/library.py` to `routes/admin.py`:
      - `POST /api/scan` (incremental scan)
      - `POST /api/rescan` (full rescan)
      - `GET /api/scan/status` (scan status polling)
      - Keep the same paths but move them to admin router
      - Update `routes/library.py` to remove these endpoints

  **Must NOT do**:
  - Do NOT delete the `_placeholder.webp` when clearing cache
  - Do NOT touch comic file data (pages, processed flag) in thumbnail rescan — only thumbnails
  - Do NOT check for new/changed/deleted files in metadata rescan — only re-parse series.json
  - Do NOT change the scan_jobs table structure (use existing columns)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `scanner/tasks.py:276-289` — `full_scan_library_task()` pattern: check running, create job, run phases, catch errors
  - `scanner/tasks.py:291-303` — `rescan_library_task()` pattern: clear data, then full scan
  - `scanner/tasks.py:193-274` — `process_library_task()` — this IS the thumbnail generation, reuse it
  - `scanner/tasks.py:19-191` — `sync_library_task()` — series.json parsing pattern at lines 44-55
  - `scanner/utils.py` — `parse_series_json()` function
  - `scanner/__init__.py:1-11` — Export pattern
  - `routes/library.py:205-260` — Current scan endpoints (POST /api/scan, POST /api/rescan, GET /api/scan/status) to be moved
  - `config.py:13` — `BASE_CACHE_DIR` for cache clearing

  **API/Type References**:
  - `db/jobs.py` — `create_scan_job(scan_type, total_comics)`, `update_scan_progress(job_id, ...)`, `complete_scan_job(job_id, status, errors)`
  - `db/series.py` — `create_or_update_series(name, metadata, category, subcategory, cover_comic_id, conn)`

  **WHY Each Reference Matters**:
  - `tasks.py:276-289` — Template for new task functions (check running, create job, error handling)
  - `tasks.py:193-274` — `process_library_task` already handles thumbnail generation; thumbnail rescan just needs to reset flags and call it
  - `tasks.py:44-55` — Shows how series.json is parsed and metadata cached per directory; metadata rescan reuses this pattern
  - `library.py:205-260` — These endpoints must move to admin.py since they're admin-only operations

  **Acceptance Criteria**:
  - [ ] `thumbnail_rescan_task()` clears cache, resets has_thumbnail, regenerates all thumbnails
  - [ ] `metadata_rescan_task()` re-parses all series.json without touching comic files
  - [ ] Both tasks create scan_jobs with correct scan_type
  - [ ] Both tasks check for running jobs before starting
  - [ ] `POST /api/scan/thumbnails` and `POST /api/scan/metadata` endpoints work
  - [ ] Scan endpoints moved from library.py to admin.py
  - [ ] `scanner/__init__.py` exports new tasks

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: New scan endpoints return correct responses
    Tool: Bash (curl)
    Preconditions: Server running on localhost:8000, admin logged in with session cookie
    Steps:
      1. curl -s -w "\n%{http_code}" -X POST http://localhost:8000/api/scan/thumbnails -b "session_token=$TOKEN"
      2. Assert: HTTP status 200 and message contains "Thumbnail rescan started"
      3. curl -s -w "\n%{http_code}" -X POST http://localhost:8000/api/scan/metadata -b "session_token=$TOKEN"
      4. Assert: HTTP status 200 or 409 (if thumbnail scan still running)
    Expected Result: Endpoints accept requests and start background tasks
    Evidence: Response bodies captured

  Scenario: Concurrent scan prevention
    Tool: Bash (curl)
    Preconditions: A scan is already running
    Steps:
      1. POST /api/scan/thumbnails
      2. Immediately POST /api/scan/metadata
      3. Assert: Second request returns 409 "A scan is already in progress"
    Expected Result: Only one scan runs at a time
    Evidence: Response status codes
  ```

  **Commit**: YES
  - Message: `feat(scanner): add thumbnail-only and metadata-only rescan tasks, move scan endpoints to admin router`
  - Files: `scanner/tasks.py`, `scanner/__init__.py`, `routes/admin.py`, `routes/library.py`

---

- [x] 4. Admin Settings API — GET/PUT /api/admin/settings

  **What to do**:
  - In `routes/admin.py`:
    - Add Pydantic model `ThumbnailSettings`:
      ```python
      class ThumbnailSettings(BaseModel):
          thumb_quality: Optional[int] = None  # 0-100
          thumb_ratio: Optional[str] = None    # e.g. "9:14"
          thumb_width: Optional[int] = None    # 60-300
          thumb_height: Optional[int] = None   # 100-400
          thumb_format: Optional[str] = None   # webp/png/jpg/best
          require_approval: Optional[int] = None  # 0 or 1
      ```
    - Add `GET /api/admin/settings`:
      - Requires `get_admin_user`
      - Returns all settings from `get_all_settings()`
      - Parse numeric values for frontend: quality as int, width as int, height as int
    - Add `PUT /api/admin/settings`:
      - Requires `get_admin_user`
      - Accepts `ThumbnailSettings` body
      - Validates: quality 0-100, width 60-300, height 100-400, format in [webp, png, jpg, best]
      - Validates: ratio matches pattern `\d+:\d+`
      - Updates only provided (non-None) fields via `set_setting()`
      - Returns updated settings

  **Must NOT do**:
  - Do NOT trigger thumbnail regeneration on settings save
  - Do NOT allow invalid format values

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `routes/admin.py:1-7` — Router setup, imports, Pydantic model pattern
  - `routes/admin.py:9-12` — Pydantic model examples: `RoleUpdate`, `PasswordReset`
  - `routes/admin.py:15-19` — Endpoint pattern with `Depends(get_admin_user)` and return type

  **API/Type References**:
  - `db/settings.py` (created in Task 1) — `get_all_settings()`, `set_setting()`, `get_thumbnail_settings()`

  **Acceptance Criteria**:
  - [ ] `GET /api/admin/settings` returns all settings as JSON
  - [ ] `PUT /api/admin/settings` updates provided fields only
  - [ ] Validation rejects quality > 100, width > 300, invalid format strings
  - [ ] Non-admin users get 403

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Get and update thumbnail settings
    Tool: Bash (curl)
    Preconditions: Server running, admin session
    Steps:
      1. GET /api/admin/settings → Assert contains thumb_quality, thumb_format keys
      2. PUT /api/admin/settings {"thumb_quality": 85, "thumb_format": "png"} → Assert 200
      3. GET /api/admin/settings → Assert thumb_quality is "85", thumb_format is "png"
    Expected Result: Settings persist correctly
    Evidence: Response bodies

  Scenario: Validation rejects bad values
    Tool: Bash (curl)
    Steps:
      1. PUT /api/admin/settings {"thumb_quality": 150} → Assert 400/422
      2. PUT /api/admin/settings {"thumb_format": "bmp"} → Assert 400/422
    Expected Result: Invalid values rejected with error messages
    Evidence: Response status codes and error messages
  ```

  **Commit**: YES
  - Message: `feat(admin): add settings API for thumbnail configuration and approval toggle`
  - Files: `routes/admin.py`

---

- [x] 5. User Approval Backend — registration gate, login gate, approve endpoint

  **What to do**:
  - In `routes/auth.py`:
    - Modify `register()`:
      - After `create_user()`, check `get_setting('require_approval')`:
        - If '1' and not the first user: `UPDATE users SET approved = 0 WHERE id = ?`
      - Return different message: `"Account created. Pending admin approval."` vs normal
    - Modify `login()`:
      - After `authenticate_user()`, check if `user['approved']` is 0:
        - If so, raise `HTTPException(status_code=403, detail="Account pending approval")`
    - Modify `/check` endpoint:
      - Include `approved` field in user response
  - In `db/users.py`:
    - Modify `get_all_users()`:
      - Add `approved` to SELECT columns (it's already in table, just need to include in result)
    - Modify `authenticate_user()`:
      - Include `approved` in the SELECT and return it in the result dict
    - Add `approve_user(user_id: int) -> bool`:
      - `UPDATE users SET approved = 1 WHERE id = ?`
      - Return True/False based on rowcount
    - Add export in `db/__init__.py`: `from .users import approve_user`
  - In `routes/admin.py`:
    - Add `PUT /api/admin/users/{user_id}/approve`:
      - Requires `get_admin_user`
      - Calls `approve_user(user_id)`
      - Returns `{"message": "User approved"}`

  **Must NOT do**:
  - Do NOT retroactively un-approve existing users
  - Do NOT allow admin to un-approve themselves
  - Do NOT block the admin user creation in `server.py:create_default_admin()` (first admin is always approved via DEFAULT 1)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3, 4, 6)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `routes/auth.py:22-35` — Current `register()` function (force role=reader, create_user)
  - `routes/auth.py:37-71` — Current `login()` function (authenticate, create session, set cookie)
  - `routes/auth.py:94-108` — Current `/check` endpoint (returns user dict with specific fields)
  - `routes/admin.py:21-35` — Admin endpoint pattern (Depends, validation, call DB function)
  - `db/users.py` — User CRUD patterns

  **API/Type References**:
  - `db/settings.py` (Task 1) — `get_setting('require_approval')` to check toggle

  **WHY Each Reference Matters**:
  - `auth.py:22-35` — Where to add the approval check after user creation
  - `auth.py:37-71` — Where to add the approved=0 check before session creation
  - `auth.py:94-108` — Must add `approved` to the user dict returned to frontend

  **Acceptance Criteria**:
  - [ ] With `require_approval=1`: new registrations get `approved=0`
  - [ ] With `require_approval=0`: new registrations get `approved=1` (default)
  - [ ] Login with `approved=0` returns 403 "Account pending approval"
  - [ ] `PUT /api/admin/users/{user_id}/approve` sets `approved=1`
  - [ ] `/api/auth/check` includes `approved` field
  - [ ] `GET /api/admin/users` includes `approved` field
  - [ ] Default admin user is always approved (DEFAULT 1 in schema)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Approval flow end-to-end
    Tool: Bash (curl)
    Preconditions: Server running, admin session, require_approval=1
    Steps:
      1. PUT /api/admin/settings {"require_approval": 1} → Assert 200
      2. POST /api/auth/register {"username":"testapproval","password":"test123"} → Assert message mentions "pending"
      3. POST /api/auth/login {"username":"testapproval","password":"test123"} → Assert 403 "pending approval"
      4. PUT /api/admin/users/{id}/approve → Assert 200
      5. POST /api/auth/login {"username":"testapproval","password":"test123"} → Assert 200 success
    Expected Result: Full approval cycle works
    Evidence: Response bodies for each step

  Scenario: Approval disabled allows immediate login
    Tool: Bash (curl)
    Preconditions: require_approval=0
    Steps:
      1. PUT /api/admin/settings {"require_approval": 0}
      2. POST /api/auth/register {"username":"testfree","password":"test123"}
      3. POST /api/auth/login {"username":"testfree","password":"test123"} → Assert 200
    Expected Result: Login succeeds immediately
    Evidence: Response status
  ```

  **Commit**: YES
  - Message: `feat(auth): add user approval flow with admin toggle and registration gate`
  - Files: `routes/auth.py`, `routes/admin.py`, `db/users.py`, `db/__init__.py`

---

- [x] 6. Reading Stats Backend — comics read and time read per user

  **What to do**:
  - In `routes/admin.py`:
    - Modify `list_users()` to use a custom SQL query with LEFT JOIN:
      ```sql
      SELECT u.*,
          COALESCE(SUM(rp.seconds_read), 0) as total_seconds_read,
          COUNT(DISTINCT rp.comic_id) as comics_started,
          COUNT(DISTINCT CASE WHEN rp.completed = 1 THEN rp.comic_id END) as comics_completed
      FROM users u
      LEFT JOIN reading_progress rp ON u.id = rp.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      ```
    - Return the 3 new fields in each user dict: `total_seconds_read`, `comics_started`, `comics_completed`
    - No longer call `get_all_users()` — use inline query since we need the JOIN

  **Must NOT do**:
  - Do NOT modify `db/users.py:get_all_users()` — leave it for other callers
  - Do NOT add indexes unless query is slow (reading_progress already has UNIQUE on user_id, comic_id)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Task 10
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `routes/admin.py:15-19` — Current `list_users()` function (simple call to get_all_users)
  - `db/progress.py` — `get_user_stats(user_id)` function shows the aggregation pattern for a single user
  - `db/connection.py:72-90` — `reading_progress` table schema with seconds_read and completed columns

  **WHY Each Reference Matters**:
  - `admin.py:15-19` — Replace this function body with the JOIN query
  - `progress.py` — Shows existing SUM/COUNT patterns on reading_progress that we're extending to all users at once

  **Acceptance Criteria**:
  - [ ] `GET /api/admin/users` returns `total_seconds_read`, `comics_started`, `comics_completed` per user
  - [ ] Users with no reading history show 0 for all stats
  - [ ] Stats are accurate (match individual user stats on profile page)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Admin users endpoint returns reading stats
    Tool: Bash (curl)
    Preconditions: Server running, admin session, at least one user with reading history
    Steps:
      1. GET /api/admin/users → Parse JSON response
      2. Assert: Each user object has keys: total_seconds_read, comics_started, comics_completed
      3. Assert: Values are integers >= 0
    Expected Result: Stats fields present and valid for all users
    Evidence: Response body
  ```

  **Commit**: YES
  - Message: `feat(admin): add reading stats (time, comics) to admin users endpoint`
  - Files: `routes/admin.py`

---

- [x] 7. Admin Page HTML Restructure — new layout with 3 sections

  **What to do**:
  - In `index.html`:
    - Replace the entire `<div id="view-admin">` content with new structure:
      ```
      view-admin
      ├── Section Header: "⚙️ Administration" / "Library settings, scanning, and user management"
      ├── Section 1: Library Metadata
      │   ├── Subsection: Scan Controls (4 buttons in a row/grid)
      │   │   ├── Incremental Scan button (🔄)
      │   │   ├── Full Re-Scan button (⚠️) — styled as danger
      │   │   ├── Thumbnail Rescan button (🖼️)
      │   │   └── Metadata Rescan button (📋)
      │   ├── Subsection: Scan Status (collapsible panel, auto-expands when active)
      │   │   ├── Progress bar
      │   │   ├── Current file / category / subcategory
      │   │   ├── Phase metrics (new/changed/deleted, pages, thumbs)
      │   │   └── Timestamps
      │   └── Subsection: Thumbnail Settings
      │       ├── Format selector (WebP / PNG / JPG / Pick Best) — select dropdown
      │       ├── Quality slider (0-100, disabled for PNG) — range input + value label
      │       ├── Aspect ratio presets (American, Bunko, Tankobon, ISO B4, MAL, Mangadex) — select dropdown
      │       ├── Width slider (constrained by ratio) — range input + value label
      │       └── Save Settings button
      ├── Section 2: User Management
      │   ├── Subsection header with "Require Approval" toggle
      │   ├── User table with columns:
      │   │   Username, Email, Role, Comics Read, Time Read, Approved, Created, Last Login, Actions
      │   └── Actions: Approve (if unapproved), Reset Password, Delete
      └── Section 3: Sequence Gaps (existing, moved)
          ├── Refresh button
          └── Gap cards grid
      ```
    - Remove `<div id="view-scan-status">` entirely (lines 325-367)
    - Use existing CSS patterns: `admin-container`, `admin-card`, `section-header`, inline styles matching current codebase
    - Add IDs for JS to hook into:
      - Scan buttons: `btn-scan-incremental`, `btn-scan-full`, `btn-scan-thumbnails`, `btn-scan-metadata`
      - Scan status: `admin-scan-status` (container), `admin-scan-progress-fill`, `admin-scan-current-file`, etc.
      - Thumbnail settings: `thumb-format-select`, `thumb-quality-slider`, `thumb-quality-value`, `thumb-ratio-select`, `thumb-width-slider`, `thumb-width-value`, `thumb-save-btn`
      - Approval toggle: `toggle-require-approval`
      - Keep existing: `admin-users-table-body`, `admin-gaps-container`

  **Must NOT do**:
  - Do NOT add external CSS files (keep inline styles matching existing patterns)
  - Do NOT add new JS imports in the HTML (admin.js handles everything)
  - Do NOT change view IDs (`view-admin` stays the same)
  - Do NOT touch other views in index.html

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: HTML/CSS layout, visual design matching existing patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Wave 2 backend tasks)
  - **Parallel Group**: Wave 3 start (but can start as soon as Task 1 is done)
  - **Blocks**: Tasks 8, 9, 10
  - **Blocked By**: Task 1 (need to know exact column names)

  **References**:

  **Pattern References**:
  - `index.html:377-419` — Current `view-admin` HTML (User Management title, user table, gaps section)
  - `index.html:325-367` — Current `view-scan-status` HTML (progress bar, metrics grid, details box) — reuse structure for inline scan status
  - `index.html:386-403` — Admin table pattern (thead with styled th, tbody with ID)
  - `index.html:405-418` — Gaps section pattern (section-header + admin-card)

  **Documentation References**:
  - User's spec defines exact scan buttons, exact aspect ratio presets with values, exact slider ranges

  **WHY Each Reference Matters**:
  - `index.html:377-419` — This is what gets replaced; must preserve the admin-table-body ID and gaps container
  - `index.html:325-367` — The scan status HTML structure to adapt for inline use; reuse progress bar, metrics grid
  - The inline style patterns (padding, border-radius, background vars) must be followed for visual consistency

  **Acceptance Criteria**:
  - [ ] `view-admin` has 3 sections: Library Metadata, User Management, Sequence Gaps
  - [ ] `view-scan-status` div removed from index.html
  - [ ] 4 scan buttons visible in Library Metadata section
  - [ ] Thumbnail settings form with format, quality, ratio, width controls
  - [ ] User table has Comics Read, Time Read, Approved columns
  - [ ] Scan status panel has progress bar and metrics
  - [ ] All element IDs match the spec for JS hookup
  - [ ] Approval toggle in User Management header

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Admin page structure renders correctly
    Tool: Playwright (playwright skill)
    Preconditions: Server running, admin logged in
    Steps:
      1. Navigate to http://localhost:8000/#/admin
      2. Wait for: h2 containing "Administration" (timeout: 5s)
      3. Assert: #btn-scan-incremental exists and visible
      4. Assert: #btn-scan-full exists and visible
      5. Assert: #btn-scan-thumbnails exists and visible
      6. Assert: #btn-scan-metadata exists and visible
      7. Assert: #thumb-format-select exists
      8. Assert: #thumb-quality-slider exists
      9. Assert: #admin-users-table-body exists
      10. Assert: #admin-gaps-container exists
      11. Assert: #admin-scan-status exists
      12. Assert: #view-scan-status does NOT exist
      13. Screenshot: .sisyphus/evidence/task-7-admin-structure.png
    Expected Result: All sections and elements present
    Evidence: .sisyphus/evidence/task-7-admin-structure.png
  ```

  **Commit**: YES
  - Message: `feat(ui): restructure admin page with Library Metadata, User Management, and inline scan status`
  - Files: `index.html`

---

- [x] 8. Feature 1 Frontend — scan buttons, thumbnail settings UI, inline scan status

  **What to do**:
  - In `static/js/admin.js`:
    - Rewrite `initAdminView()` to initialize all sections:
      1. `loadUsers()` (existing, will be modified in Task 10)
      2. `loadSettings()` (new)
      3. `initScanStatus()` (new — starts polling if scan active)
      4. `setupScanButtons()` (new)
      5. `setupThumbnailSettings()` (new)
    - Add `loadSettings()`:
      - `apiGet('/api/admin/settings')` → populate form fields
      - Set format dropdown, quality slider value, ratio dropdown, width slider
      - If format is 'png', disable quality slider
    - Add `setupScanButtons()`:
      - `#btn-scan-incremental` click → `apiPost('/api/scan')` → start polling
      - `#btn-scan-full` click → show confirmation modal → if confirmed → `apiPost('/api/rescan')` → start polling
      - `#btn-scan-thumbnails` click → `apiPost('/api/scan/thumbnails')` → start polling
      - `#btn-scan-metadata` click → `apiPost('/api/scan/metadata')` → start polling
      - Disable all scan buttons while a scan is running
      - Re-enable when scan completes
    - Add `setupThumbnailSettings()`:
      - Format change handler: disable quality slider when 'png' selected
      - Ratio change handler: recalculate width/height slider min/max/value based on ratio
        - Parse ratio as w:h, compute height = (width * h) / w
        - Update display: "Width: Xpx × Height: Ypx"
      - Width slider change handler: compute height from ratio, update display
      - Save button: `apiPut('/api/admin/settings', { thumb_quality, thumb_format, thumb_ratio, thumb_width, thumb_height })`
    - Add `initScanStatus()`:
      - Move polling logic from `scan-status.js` into admin.js (or import and reuse)
      - Target admin page elements: `#admin-scan-progress-fill`, `#admin-scan-current-file`, etc.
      - Parse `current_file` path: extract category/subcategory from COMICS_DIR-relative path
      - Auto-expand the scan status panel when scan is running (add/remove CSS class)
      - Auto-collapse when idle
      - Animated progress bar (CSS transition already exists in progress-fill style)
    - Add confirmation modal function for Full Re-Scan:
      - Reuse existing modal pattern from `auth.js:showLoginModal`
      - "⚠️ Full Re-Scan will erase all data and re-scan from scratch. Continue?"
      - OK / Cancel buttons
    - Remove import of `scanLibrary` from `library.js` in main.js (no longer needed)
    - Register cleanup for admin view: `registerCleanup('admin', stopAdminScanPolling)` to stop polling when leaving admin page

  **Must NOT do**:
  - Do NOT use any UI framework or library
  - Do NOT add WebSocket — keep polling at 3-second interval
  - Do NOT auto-save thumbnail settings (explicit Save button only)
  - Do NOT show scan status outside the admin page

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 2, 3, 4, 7

  **References**:

  **Pattern References**:
  - `static/js/admin.js:1-6` — Current initAdminView pattern (import api, call loadUsers)
  - `static/js/admin.js:58-103` — Window-exposed handlers pattern (for onclick compatibility)
  - `static/js/scan-status.js:1-111` — ENTIRE FILE: scan polling pattern, UI update pattern, cleanup registration
  - `static/js/auth.js:174-226` — Modal creation pattern (createElement overlay, innerHTML, append to body, animation)
  - `static/js/library.js:137-178` — Current `scanLibrary()` function (to be replaced by admin buttons)
  - `static/js/api.js:1-76` — apiGet, apiPost, apiPut patterns

  **External References**:
  - Aspect ratio presets from user spec: American (663:1024), Bunko (128:182), Tankobon (114:172), ISO B4 (257:364), MAL (9:14), Mangadex (512:713)

  **WHY Each Reference Matters**:
  - `scan-status.js:1-111` — The polling and UI update logic to port/adapt for inline use on admin page
  - `auth.js:174-226` — The modal pattern for the Full Re-Scan confirmation dialog
  - `library.js:137-178` — Must understand what's being removed (scanLibrary function calls)

  **Acceptance Criteria**:
  - [ ] 4 scan buttons trigger correct API calls
  - [ ] Full Re-Scan shows confirmation modal before executing
  - [ ] Scan status polls and updates inline on admin page
  - [ ] Scan status panel auto-expands when scan is active
  - [ ] Thumbnail settings load from API on page init
  - [ ] Quality slider disabled when PNG selected
  - [ ] Ratio presets calculate correct width/height
  - [ ] Save button persists settings to API
  - [ ] All scan buttons disabled during active scan
  - [ ] Polling stops when navigating away from admin page

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Scan button triggers incremental scan and status updates
    Tool: Playwright (playwright skill)
    Preconditions: Server running, admin logged in, library configured
    Steps:
      1. Navigate to http://localhost:8000/#/admin
      2. Wait for: #btn-scan-incremental visible
      3. Click: #btn-scan-incremental
      4. Wait for: scan status panel expanded (timeout: 5s)
      5. Assert: Progress bar visible
      6. Assert: Scan buttons are disabled
      7. Wait for: scan completion (status no longer "running") (timeout: 120s)
      8. Assert: Scan buttons re-enabled
      9. Screenshot: .sisyphus/evidence/task-8-scan-running.png
    Expected Result: Scan starts, status shows inline, buttons disabled during scan
    Evidence: .sisyphus/evidence/task-8-scan-running.png

  Scenario: Full rescan shows confirmation modal
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to http://localhost:8000/#/admin
      2. Click: #btn-scan-full
      3. Wait for: .modal-overlay visible (timeout: 3s)
      4. Assert: Modal contains warning text about erasing data
      5. Click: Cancel button
      6. Assert: Modal closes, no scan started
      7. Screenshot: .sisyphus/evidence/task-8-rescan-modal.png
    Expected Result: Confirmation modal prevents accidental destructive action
    Evidence: .sisyphus/evidence/task-8-rescan-modal.png

  Scenario: Thumbnail settings save and persist
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to http://localhost:8000/#/admin
      2. Select: #thumb-format-select → "png"
      3. Assert: #thumb-quality-slider is disabled
      4. Select: #thumb-format-select → "webp"
      5. Assert: #thumb-quality-slider is enabled
      6. Set: #thumb-quality-slider value to 85
      7. Select: #thumb-ratio-select → ratio containing "663:1024" (American)
      8. Click: #thumb-save-btn
      9. Wait for: toast message (timeout: 3s)
      10. Reload page
      11. Assert: #thumb-format-select value is "webp"
      12. Assert: #thumb-quality-slider value is 85
      13. Screenshot: .sisyphus/evidence/task-8-thumb-settings.png
    Expected Result: Settings persist across page loads
    Evidence: .sisyphus/evidence/task-8-thumb-settings.png
  ```

  **Commit**: YES
  - Message: `feat(admin): add scan controls, thumbnail settings UI, and inline scan status to admin page`
  - Files: `static/js/admin.js`, `static/js/main.js`

---

- [x] 9. Feature 2 Frontend — approval toggle and registration message

  **What to do**:
  - In `static/js/admin.js`:
    - In `initAdminView()`, add: `loadApprovalSetting()`
    - Add `loadApprovalSetting()`:
      - Load from settings API
      - Set `#toggle-require-approval` checked state
    - Add handler for `#toggle-require-approval` change:
      - `apiPut('/api/admin/settings', { require_approval: checked ? 1 : 0 })`
      - `showToast('Approval requirement updated')`
    - Modify `loadUsers()` table rendering:
      - Add "Approve" button for users where `approved === 0`:
        - Button: `<button onclick="window.adminApproveUser(${user.id})" class="btn-secondary" style="...">✅ Approve</button>`
      - Show approved status indicator: ✅ or ⏳ icon
    - Add `window.adminApproveUser(userId)`:
      - `apiPut('/api/admin/users/${userId}/approve')`
      - `showToast('User approved')`
      - `await loadUsers()` to refresh table
  - In `static/js/auth.js`:
    - Modify `handleRegister()`:
      - Check response for approval-pending message
      - If response indicates pending: show message "Your account will be reviewed by an administrator"
    - Modify `handleLogin()`:
      - Check for 403 status specifically
      - Show toast: "Account pending administrator approval" (not generic "Invalid credentials")

  **Must NOT do**:
  - Do NOT show approval-related UI to non-admin users
  - Do NOT auto-refresh the registration form after showing pending message

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 5, 7

  **References**:

  **Pattern References**:
  - `static/js/admin.js:27-55` — User table row rendering (innerHTML template with inline styles)
  - `static/js/admin.js:46-52` — Action buttons pattern (Reset, Delete)
  - `static/js/admin.js:58-72` — Window handler pattern (confirm, API call, toast, reload)
  - `static/js/auth.js:279-298` — `handleRegister()` (POST, check error, show toast, switch form)
  - `static/js/auth.js:246-277` — `handleLogin()` (POST, check error, update state)

  **WHY Each Reference Matters**:
  - `admin.js:27-55` — Where to add approved status column and approve button in the table row template
  - `auth.js:279-298` — Where to add approval-pending message after registration
  - `auth.js:246-277` — Where to add 403-specific error handling for unapproved login

  **Acceptance Criteria**:
  - [ ] Approval toggle visible in User Management section header
  - [ ] Toggle persists to API on change
  - [ ] Unapproved users show ⏳ with "Approve" button
  - [ ] Approved users show ✅
  - [ ] Approve button works and refreshes table
  - [ ] Registration shows approval-pending message when enabled
  - [ ] Login shows "pending approval" for unapproved users (not generic error)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Approval toggle and approve user flow
    Tool: Playwright (playwright skill)
    Preconditions: Server running, admin logged in
    Steps:
      1. Navigate to http://localhost:8000/#/admin
      2. Assert: #toggle-require-approval exists
      3. Check: #toggle-require-approval (enable approval)
      4. Wait for: toast "updated" (timeout: 3s)
      5. In new incognito tab: Register new user "pendinguser"
      6. Assert: Message contains "reviewed by an administrator"
      7. Try to login as "pendinguser" → Assert: error message about "pending approval"
      8. Back in admin tab: Assert: pendinguser row shows ⏳ and Approve button
      9. Click: Approve button for pendinguser
      10. Assert: pendinguser row now shows ✅
      11. Screenshot: .sisyphus/evidence/task-9-approval-flow.png
    Expected Result: Full approval lifecycle works
    Evidence: .sisyphus/evidence/task-9-approval-flow.png
  ```

  **Commit**: YES
  - Message: `feat(admin): add user approval toggle, approve buttons, and registration/login messages`
  - Files: `static/js/admin.js`, `static/js/auth.js`

---

- [x] 10. Feature 3 Frontend — Comics Read and Time Read columns

  **What to do**:
  - In `static/js/admin.js`:
    - Modify `loadUsers()` table header:
      - Add `<th>Comics Read</th>` and `<th>Time Read</th>` between "Role" and "Created" columns
      - Update all `colspan` values if any exist (loading state, empty state, error state)
    - Modify user row rendering:
      - Add Comics Read column: `"${user.comics_completed}/${user.comics_started}"` format
        - If both 0: show "—"
      - Add Time Read column: format `user.total_seconds_read` as human readable
    - Add helper function `formatReadingTime(totalSeconds)`:
      - 0 → "—"
      - < 60 → "Xs"
      - < 3600 → "Xm Ys"
      - < 86400 → "Xh Ym"
      - >= 86400 → "Xd Yh"

  **Must NOT do**:
  - Do NOT add sorting to these columns (keep existing table behavior)
  - Do NOT add per-user detail views

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8, 9)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 7

  **References**:

  **Pattern References**:
  - `static/js/admin.js:8-56` — Current `loadUsers()` function (table rendering, column structure)
  - `static/js/admin.js:12` — Loading state with `colspan="6"` (needs updating to match new column count)
  - `static/js/admin.js:34-53` — User row innerHTML template (where to insert new columns)
  - `index.html:389-397` — Table thead with column headers (if modified in Task 7)

  **WHY Each Reference Matters**:
  - `admin.js:34-53` — The exact template where new `<td>` elements for stats must be inserted
  - `admin.js:12` — colspan must change from 6 to 8 (or whatever final count) for loading/error/empty states

  **Acceptance Criteria**:
  - [ ] "Comics Read" column shows "completed/started" format
  - [ ] "Time Read" column shows human-readable duration
  - [ ] Users with no reading history show "—" in both columns
  - [ ] Column headers match data alignment

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Stats columns display correctly
    Tool: Playwright (playwright skill)
    Preconditions: Server running, admin logged in, at least one user with reading history
    Steps:
      1. Navigate to http://localhost:8000/#/admin
      2. Wait for: #admin-users-table-body has rows (timeout: 5s)
      3. Assert: Table has "Comics Read" header
      4. Assert: Table has "Time Read" header
      5. Assert: At least one row shows non-"—" values (if reading data exists)
      6. Assert: Time format matches pattern (Xh Ym, Xd Yh, etc.)
      7. Screenshot: .sisyphus/evidence/task-10-stats-columns.png
    Expected Result: Stats display correctly formatted
    Evidence: .sisyphus/evidence/task-10-stats-columns.png
  ```

  **Commit**: YES
  - Message: `feat(admin): add comics read and time read columns to user management table`
  - Files: `static/js/admin.js`

---

- [x] 11. Bugfix 4 — Remove old scan status view, clean up menu and router

  **What to do**:
  - In `static/js/auth.js`:
    - Modify `updateAuthUI()` admin section:
      - Remove "Scan Library" menu item (the `onclick="scanLibrary(event)"` div)
      - Remove "Scan Status" menu item (the `onclick="showScanStatus()"` div)
      - Rename "User Management" to "Administration"
      - Change icon from 👥 to ⚙️
      - Result: admin section has only one item: "Administration" → navigates to `#/admin`
  - In `static/js/main.js`:
    - Remove `scanLibrary` from `library.js` import (line 9)
    - Remove `showScanStatus, startScanPolling` from `scan-status.js` import (line 30)
    - Remove `window.showScanStatus = showScanStatus` (line 102)
    - Modify `case 'scan'` in hashchange handler (line 187-190):
      - Instead of `showScanStatus()`, redirect to admin: `router.navigate('admin', {}); return;`
    - Remove or comment out the old scan functions from window exposure
  - In `static/js/router.js`:
    - Keep `case 'scan'` in `parseHash()` for backward compatibility (redirects to admin)
    - OR: Change `case 'scan'` to return `{view: 'admin', params: {}}` directly
  - In `static/js/scan-status.js`:
    - Can either:
      a. Delete the file entirely (if all polling logic moved to admin.js in Task 8)
      b. Or keep it as a module imported only by admin.js
    - If keeping: remove `showScanStatus()` export and the `registerCleanup('scan', ...)` call
  - In `static/js/library.js`:
    - Remove or deprecate `scanLibrary()` function (lines 137-178)
    - Remove it from exports
  - Verify no other files reference `view-scan-status`, `showScanStatus`, or `scanLibrary`

  **Must NOT do**:
  - Do NOT break the admin page's inline scan status (already built in Task 8)
  - Do NOT remove the /api/scan/status endpoint (it's used by admin page polling)
  - Do NOT leave orphaned imports or window assignments

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10)
  - **Parallel Group**: Wave 3 (after Task 8)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `static/js/auth.js:138-153` — Admin menu items in `updateAuthUI()` (Scan Library, Scan Status, User Management)
  - `static/js/main.js:9` — `scanLibrary` import from library.js
  - `static/js/main.js:30` — `showScanStatus, startScanPolling` import from scan-status.js
  - `static/js/main.js:102` — `window.showScanStatus = showScanStatus`
  - `static/js/main.js:187-190` — `case 'scan'` in hashchange handler
  - `static/js/library.js:137-178` — `scanLibrary()` function to remove
  - `static/js/scan-status.js:1-112` — Entire file (functions to remove or relocate)
  - `static/js/router.js:97-98` — `case 'scan'` in parseHash

  **WHY Each Reference Matters**:
  - `auth.js:138-153` — The 3 menu items to reduce to 1 ("Administration")
  - `main.js:9,30,102,187-190` — All places where old scan functionality is imported/exposed/routed
  - `library.js:137-178` — The scanLibrary function that's no longer needed (replaced by admin buttons)

  **Acceptance Criteria**:
  - [ ] Hamburger menu shows only "Administration" (no Scan Library, no Scan Status)
  - [ ] `#view-scan-status` does not exist in DOM
  - [ ] Navigating to `#/scan` redirects to `#/admin`
  - [ ] `scanLibrary` function removed from library.js exports
  - [ ] No JavaScript errors in console after all removals
  - [ ] Admin page scan status still works (from Task 8)

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Menu cleanup and redirect
    Tool: Playwright (playwright skill)
    Preconditions: Server running, admin logged in
    Steps:
      1. Navigate to http://localhost:8000/#/library
      2. Click hamburger menu button
      3. Assert: Menu contains "Administration" item
      4. Assert: Menu does NOT contain "Scan Library"
      5. Assert: Menu does NOT contain "Scan Status"
      6. Assert: Menu does NOT contain "User Management"
      7. Navigate to http://localhost:8000/#/scan
      8. Wait for: URL to change to #/admin (timeout: 3s)
      9. Assert: Admin page is visible
      10. Assert: no JS errors in console
      11. Screenshot: .sisyphus/evidence/task-11-menu-cleanup.png
    Expected Result: Clean menu, proper redirect, no errors
    Evidence: .sisyphus/evidence/task-11-menu-cleanup.png

  Scenario: No orphaned DOM elements
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to http://localhost:8000/
      2. Execute JS: document.getElementById('view-scan-status')
      3. Assert: Returns null
    Expected Result: Old scan status view completely removed
    Evidence: Console output
  ```

  **Commit**: YES
  - Message: `fix(ui): remove scan status view, clean up menu items, redirect #/scan to #/admin`
  - Files: `static/js/auth.js`, `static/js/main.js`, `static/js/library.js`, `static/js/scan-status.js`, `static/js/router.js`

---

## Commit Strategy

| After Task | Message | Key Files | Verification |
|-----------|---------|-----------|-------------|
| 1 | `feat(db): add migration v7` | db/connection.py, db/settings.py, db/__init__.py | `python -c "from db.connection import init_db; init_db()"` |
| 2 | `feat(scanner): configurable thumbnails` | config.py, scanner/archives.py, scanner/tasks.py, routes/library.py | `python -c "from scanner.archives import save_thumbnail"` |
| 3 | `feat(scanner): thumbnail + metadata rescan tasks` | scanner/tasks.py, scanner/__init__.py, routes/admin.py, routes/library.py | `python -c "from scanner import thumbnail_rescan_task, metadata_rescan_task"` |
| 4 | `feat(admin): settings API` | routes/admin.py | curl GET /api/admin/settings |
| 5 | `feat(auth): user approval flow` | routes/auth.py, routes/admin.py, db/users.py, db/__init__.py | curl approval flow |
| 6 | `feat(admin): reading stats in users` | routes/admin.py | curl GET /api/admin/users |
| 7 | `feat(ui): admin page restructure` | index.html | Visual check via Playwright |
| 8 | `feat(admin): scan controls + thumb settings UI` | static/js/admin.js, static/js/main.js | Playwright interaction test |
| 9 | `feat(admin): approval toggle + messages` | static/js/admin.js, static/js/auth.js | Playwright approval flow |
| 10 | `feat(admin): stats columns` | static/js/admin.js | Playwright table check |
| 11 | `fix(ui): remove scan status view + menu cleanup` | auth.js, main.js, library.js, scan-status.js, router.js | Playwright menu + redirect |

---

## Success Criteria

### Verification Commands
```bash
# Server starts without errors
python server.py  # Expected: no migration errors, server starts on :8000

# DB migration applied
python -c "from db.connection import init_db, get_db_connection; init_db(); c = get_db_connection(); print(c.execute('PRAGMA user_version').fetchone()[0])"  # Expected: 7

# Settings API works
curl -s http://localhost:8000/api/admin/settings -b "session_token=..." | python -m json.tool  # Expected: JSON with thumb settings

# All scan endpoints exist
curl -s -X POST http://localhost:8000/api/scan -b "session_token=..."  # Expected: 200 or 409
curl -s -X POST http://localhost:8000/api/scan/thumbnails -b "session_token=..."  # Expected: 200 or 409
curl -s -X POST http://localhost:8000/api/scan/metadata -b "session_token=..."  # Expected: 200 or 409
```

### Final Checklist
- [x] All 4 scan types trigger and complete successfully
- [x] Thumbnail settings persist and affect new scans
- [x] "Pick Best" format produces smallest file
- [x] User approval toggle works end-to-end
- [x] Reading stats accurate in admin table
- [x] Scan status inline on admin page
- [x] Old scan-status view completely removed
- [x] Hamburger menu has only "Administration" for admin
- [x] No JavaScript console errors
- [x] No Python import errors
- [x] DB migration is idempotent
