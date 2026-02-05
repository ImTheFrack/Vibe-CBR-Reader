# Vibe CBR Reader - TODO & Roadmap

This file tracks the project's outstanding tasks, known bugs, and future roadmap.

## 🔴 HIGH Priority - Known Issues & Security Hardening
- [ ] **Secure Password Hashing**: Migrate from unsalted SHA256 to `bcrypt`. (`database.py:248,273`)
    - **Implementation Details**:
        1. Add `bcrypt` to `requirements.txt`.
        2. Modify `create_user` to use `bcrypt.hashpw()` with a salt.
        3. Modify `authenticate_user` to support **Lazy Migration**: Fetch user by username; if the hash is legacy (SHA256), verify it, and if successful, immediately re-hash with `bcrypt` and update the DB record.
- [ ] **SQL Safety & Parameterization**:
    - **Fix `create_session`**: Change query build to use `datetime('now', ? || ' hours')` with parameters instead of `.format()`.
    - **Audit**: Replace all occurrences of `.format()` or f-strings inside `conn.execute()` with `?` placeholders.
- [ ] **User Management & Admin Security**:
    - **Registration Hardening**: Hardcode default role to "reader" in `routes/auth.py` and ignore any client-supplied `role` field.
    - **Scan Auth**: Add `Depends(get_admin_user)` to `/api/scan/status` and all library task endpoints.
    - **Admin Tools**: Implement `PUT /api/admin/users/{user_id}/role` for promotion/demotion and `PUT /api/admin/users/{user_id}/password` for forced resets.
    - **Frontend**: Create a "User Management" view (`view-admin-users`) with a table showing roles, last login, and action buttons.
- [ ] **Default Credentials & Initial Setup**:
    - **Schema Update**: Add `must_change_password` (BOOLEAN DEFAULT 0) column to `users`.
    - **Initial Admin Logic**: Support `VIBE_ADMIN_USER` and `VIBE_ADMIN_PASS` env vars. If creating the default `admin/admin123` account, set `must_change_password = 1`.
    - **Force Change Flow**: If `must_change_password` is true, display a non-dismissible "Reset Default Password" modal immediately after login.

## 🟡 MEDIUM Priority - Infrastructure & Reliability
- [ ] **Portable Configuration & Key Safety**:
    - **Implementation Details**:
        1. Support `python-dotenv` for `VIBE_COMICS_DIR`, `VIBE_DB_PATH`, `VIBE_SECRET_KEY`.
        2. **Git Safety**: Ensure `.env` is ignored and provide `.env.example`.
        3. **Production Guard**: Refuse to start in production mode if `VIBE_SECRET_KEY` is a default value.
        4. **Randomized Fallback**: Generate a temporary random secret on startup if none is provided in development.
- [ ] **Page Content Type & Jpeg XL Support**:
    - **Implementation Details**:
        1. Add `.jxl` to `IMG_EXTENSIONS`.
        2. Use `mimetypes` module in `get_comic_page` to detect format.
        3. Explicitly register `image/jxl` mapping for the newer standard.
        4. Return correct `media_type` in FastAPI `Response`.
- [ ] **Refactoring & Modularization**:
    - **Implementation Details**:
        1. **JS**: Split `static/js/library.js` into smaller, logical modules (e.g., `navigation.js`, `view-renderers.js`, `search.js`) to improve maintainability and reliability.
        2. **Python**: Audit large files like `database.py` and `scanner.py` for potential decomposition into smaller, more focused modules or utilities.
        3. **Code Reuse**: Identify and extract common patterns into shared utility functions.

## 📚 Phase 2: Enhanced Library Management
- [ ] **User Profile & Personalization**:
    - **Profile Page**: Central view for account settings, `POST /api/users/me/password` (requires current password validation), and stats.
    - **Integrated Stats**: Dashboard showing reading speed, completion rates, and library growth metrics.
    - **History**: Implement "Import/Export Reading History" as JSON.
- [ ] **Collections & Discovery**:
    - **Shared Lists**: Custom lists with `is_public` flags; community view to browse public collections.
    - **Advanced Search**: Deep metadata search (synopsis, authors) using SQLite FTS5.
    - **Filters**: UI filters for genre, status, and read/unread state.
- [ ] **Anonymous Star Ratings**: 5-star system for series/comics; individual votes are private, only averages are public.
- [ ] **Modular Batch Operations Framework**:
    - **Selection Mode**: UI checkboxes on cards to trigger an "Action Queue".
    - [x] **Export as CBZ**: Backend implemented in `/api/export/cbz`. Supports streaming multi-comic exports with numerical sorting and zero-compression (ZIP_STORED) for efficiency. [Frontend UI pending]
- [ ] **Sequence Gap Detection**: Identify numerical jumps in chapter/volume sequences (e.g., Vol 1, 2, 4 -> 3 is missing) and provide a "Gaps Report".

## 📖 Phase 3: Reader Enhancements
- [X] **Performance & Preloading**: Prefetch the next 2-3 pages into a background buffer using a `PrefetchManager` class.
- [X] **Mobile Navigation Gestures**: Implement native `pointerdown/move/up` events via a `GestureController` class for swipes and pinch-to-zoom (using CSS transforms).
- [X] **Reading Environment**:
    - **Memory**: Per-comic settings memory (remember zoom mode and direction per title).
    - **Visual Navigation**: Thumbnail-based "scrubber" bar for rapid jumping.
    - **Auto-advance**: Configurable timer for automatic page turning.
    - **Filters**: Brightness and Warmth (sepia) CSS filters for night reading.
- [X] **Utility**: Track time spent reading per session and per series; support custom remappable keybindings.

## 🔍 Phase 4: Metadata & Discovery - BASED ON VIBEMANGA PROJECT TO BE IMPORTED - FUTURE
- [ ] **Page Annotations**: Save notes, snippets, or highlights on specific pages.
- [ ] **Duplicate Detection**: Identify duplicate files by name, size, and fuzzy title matching.
- [ ] **External Metadata**: Auto-fetch from MAL, AniList, or internal `ComicInfo.xml`.
- [ ] **Recommendations**: Suggest series based on shared tags and genres.
- [ ] **Reorganize**: Categorize, with AI assistance
- [ ] **Scrape, Match, Grab & Pull**: Torrents integration via nyaa.si and qbittorrent.
- [ ] **Discovery Views**: Homepage carousel for "New Additions" and "Continue Reading."
- [ ] **Metadata Supplementation/Editing**: Allow supplementing or editing metadata, including with AI assistance.

## 🟢 FUTURE: Hardening & Quality
- [ ] **Backend Unit Tests**: Implement tests for API routes and scanning logic.
- [ ] **Structured Logging**: Replace `print()` statements with the Python `logging` module.
- [ ] **API Pagination**: Add pagination for `/api/books` and `/api/series`.
- [ ] **Database Migrations**: Implement a versioned schema migration system.
- [ ] **Type Hints**: Complete Python type hints across all backend modules.
- [ ] **Frontend Linting**: Integrate ESLint and Prettier.
- [ ] **PWA Support**: Offline reading and installable app via Service Workers.
- [ ] **OPDS Feed**: Expose library for external reader apps (Librera, KOReader).
- [ ] **Multi-Library**: Support multiple root comic directories.
- [ ] **User Avatars**: Support Gravatar or local uploads.
- [ ] **Activity Feed**: Shared social feed for reading activity.

## 🛠 Code Quality Goals
- [ ] Replace remaining inline `onclick` handlers with event delegation.
- [ ] Refactor reader modes (Double/Long Strip) for better performance.