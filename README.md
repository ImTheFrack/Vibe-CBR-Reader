# Vibe CBR Reader

A modern, web-based comic book reader designed for CBR and CBZ archives. Featuring a sleek MangaDex-inspired interface, it offers a powerful hierarchical navigation system and full metadata support via `series.json`.

## Core Features

- **Multiple View Modes**: Browse your library in Grid, List, or Detailed card views.
- **Hierarchical Navigation**: Efficiently navigate through large libraries using a Root → Category → Subcategory → Title structure.
- **Contextual Sidebar**: Always know where you are with a sidebar that adapts to your current location.
- **Flatten Mode**: View all comics in a subtree with a single toggle.
- **Rich Metadata**: Automatic parsing of `series.json` to display synopses, authors, genres, and external links (MAL/AniList).
- **Advanced Reader**:
  - Single page, double page (spread), and long strip (webtoon) modes.
  - Left-to-right (Western) and Right-to-left (Manga) reading directions.
  - Page bookmarks and progress tracking saved to your user account.
- **Dark/Light Themes**: Customizable interface with persistent user preferences.
- **Global Search**: Search across titles, series, and categories with scoped or global options.

## Technical Considerations

### Security
- **Path Traversal Protection**: Securely serves comic files while preventing unauthorized access.
- **Input Validation**: Rigorous validation on all API endpoints.
- **Authentication**: Password hashing (SHA256 — bcrypt migration planned) and session management via HTTP-only cookies.
- **SQL Injection Prevention**: All database interactions use parameterized queries.

### Scalability
- **Large Libraries**: Optimized to support 10k+ comics with efficient SQLite queries.
- **Caching**: Intelligent image caching strategies for thumbnails and covers.
- **Background Processing**: Heavy operations like library scanning run as background tasks.

### Cross-Platform
- Works seamlessly on Windows, Linux, and macOS.
- **Mobile Responsive**: Fully optimized for tablets and smartphones.
- **Docker Support**: Ready for containerized deployment on NAS or servers.

## Keyboard Shortcuts

- `←` / `A`: Previous page
- `→` / `D` / `Space`: Next page
- `Shift + ←`: Previous chapter/volume
- `Shift + →`: Next chapter/volume
- `F`: Toggle Fullscreen
- `B`: Toggle Bookmark
- `ESC`: Close Reader

## Development Roadmap

### Phase 1: Core Infrastructure ✅ COMPLETED
- Responsive Frontend UI with Grid, List, and Detailed views
- User authentication with 30-day session management
- Database-backed reading progress and bookmarks
- Hierarchical folder navigation (Root > Category > Subcategory > Title)
- Flatten mode to view all titles in a subtree
- Rich metadata display from `series.json`
- Dark/light theme with persistence
- Global search with scoped/everywhere toggle
- Multiple sort criteria (alpha, date, pages, size, recent)

### Phase 1.5: Scanning & Performance ✅ COMPLETED
- Two-phase scanning (fast sync + background processing)
- On-demand thumbnail generation with timeout fallback
- On-demand (lazy) page counting in reader
- Real-time scan metrics dashboard (phase, file, new/changed/deleted)
- Full rescan with database wipe (Shift+Click)
- Change detection via `mtime` + `size_bytes`
- WAL mode and batch operations for database concurrency

### Phase 1.6: Series & Discovery ✅ COMPLETED
- Series detail page with volume listing and stats
- Tag-based filtering with related tag refinement
- Continue reading indicator (first unread/in-progress volume)
- Prev/next comic navigation within a series
- Recently read comics view
- Admin user management panel

### Phase 2: Hardening & Quality (Next)
- [ ] Migrate password hashing from SHA256 to bcrypt/argon2id
- [ ] Lock down registration (default role "reader", admin-only role assignment)
- [ ] Environment variable config (`COMICS_DIR`, `DB_PATH`, `SECRET_KEY`)
- [ ] Complete double-page (spread) reader mode
- [ ] Complete long strip (webtoon) reader mode
- [ ] Rate limiting on auth endpoints
- [ ] Structured logging (replace `print()` with `logging` module)
- [ ] Database migration system (versioned schema changes)
- [ ] API pagination for `/api/books` and `/api/series`
- [ ] Fix page serving content type (detect PNG/WebP/GIF)

### Phase 3: Enhanced Library Management
- [ ] Collections & reading lists (Favorites, Want to Read, custom)
- [ ] Star ratings per comic or series
- [ ] Batch operations (mark all as read, bulk add to collection)
- [ ] Missing volume detection (compare parsed volumes vs `total_volumes`)
- [ ] Library statistics dashboard (total comics, pages read, completion rates)
- [ ] Duplicate detection (flag similar names/sizes across folders)
- [ ] Import/export reading history as JSON
- [ ] Advanced search filters (genre, status, author, read/unread, year)

### Phase 4: Enhanced Reader Experience
- [ ] Page preloading (prefetch next 2-3 pages)
- [ ] Swipe gestures for mobile page turning (respecting LTR/RTL)
- [ ] Pinch-to-zoom with pan on mobile
- [ ] Page annotations (draw/highlight, saved per-user)
- [ ] Reading timer (track time per session and per comic)
- [ ] Auto-advance with configurable timer
- [ ] Per-comic settings memory (remember zoom/direction per comic)
- [ ] Brightness/warmth controls (CSS filters for night reading)

### Phase 5: Metadata & Discovery
- [ ] MAL/AniList API integration (auto-fetch metadata by title or ID)
- [ ] ComicInfo.xml parsing (standard comic metadata from CBZ archives)
- [ ] "Similar series" recommendations (based on shared tags/genres)
- [ ] New additions view (recently scanned, sorted by scan date)
- [ ] Homepage dashboard (continue reading carousel, new additions)
- [ ] Series completion tracker (owned vs total volumes)
- [ ] Reading challenges (goals like "read 50 volumes this month")

### Phase 6: Platform & Distribution
- [ ] Docker Compose (production-ready with env vars, volume mounts, health checks)
- [ ] PWA / Service Worker (offline reading of cached pages, installable app)
- [ ] OPDS feed (expose library for external readers like Librera, KOReader)
- [ ] PDF comic support
- [ ] EPUB manga/comic support
- [ ] WebSocket scan updates (real-time push instead of polling)
- [ ] Multi-library support (multiple comic directories)
- [ ] Reverse proxy ready (configurable base path for nginx/caddy)

### Phase 7: Social & Multi-User
- [ ] User avatars (upload or Gravatar)
- [ ] Per-user library restrictions (role-based access to categories)
- [ ] Shared reading lists (publish collections for other users)
- [ ] User activity feed ("X started reading Y")
- [ ] Reading statistics comparison across users
- [ ] Guest access (configurable read-only browsing without account)

## Known Issues

| Severity | Issue | Location |
|----------|-------|----------|
| HIGH | Password hashing uses unsalted SHA256 instead of bcrypt | `database.py:248` |
| HIGH | Any user can register as admin via `role` field | `routes/auth.py:14,28` |
| MEDIUM | `COMICS_DIR` hardcoded to Windows path | `config.py:4` |
| MEDIUM | Default admin `admin/admin123` with no forced change | `server.py:44` |
| LOW | `create_session` uses `.format()` in SQL string | `database.py:298` |
| LOW | Session default 24h vs 720h mismatch | `database.py:291` |
| LOW | `/api/scan/status` has no auth check | `routes/library.py:167` |
| LOW | Page images always served as `image/jpeg` | `routes/library.py:335` |

## Recent Changes

### 2026-02-03
- **Audit**: Full codebase review with 8 confirmed bugs documented.
- **Updated**: Roadmap expanded from 3 to 7 phases reflecting actual feature state.
- **Tracked**: All completed features now properly listed in roadmap.

### 2026-02-01
- **Overhaul**: Redesigned Title View UI for better readability.
- **Refactor**: Unified frontend rendering logic, reducing code size and improving maintainability.
- **Improved**: Added support for nested folder metadata scanning.
- **Feature**: Full Library Rescan with confirmation (Shift+Click on Scan).
- **Fixes**: Optimized volume/chapter sorting and fixed various UI navigation bugs.
