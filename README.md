# Vibe CBR Reader

A modern, web-based comic book reader designed for CBR and CBZ archives. Featuring a sleek MangaDex-inspired interface, it offers a powerful hierarchical navigation system and full metadata support via `series.json`.

## Core Features

- **Multiple View Modes**: Browse your library in Grid, List, or Detailed card views.
- **Hierarchical Navigation**: Efficiently navigate through large libraries using a Root → Category → Subcategory → Title structure.
- **Contextual Sidebar**: Always know where you are with a sidebar that adapts to your current location.
- **Flatten Mode**: View all comics in a subtree with a single toggle.
- **Rich Metadata**: Automatic parsing of `series.json` to display synopses, authors, genres, and external links (MAL/AniList).
- **Deep Search & Filtering**: 
  - **FTS5 Search**: Global search through synopses, authors, and alternative titles.
  - **Live Filters**: Filter by Genre, Publication Status, and Read/Unread state.
- **Selection & Batch Export**:
  - **Selection Mode**: Select multiple series or individual chapters.
  - **Background Packing**: UUID-based background export system with progress tracking and cancellation.
  - **Internal Structuring**: Preserves folder hierarchy inside exported CBZ files.
- **Anonymous Ratings**: 5-star rating system with average score tracking.
- **E-Reader Mode**: A high-contrast, cleanly-lined interface designed for minimalist reading or e-ink displays, featuring pure black/white themes with no shadows or rounded corners.
- **Advanced Reader**:
  - Single page (1P), double page (2P), and long strip (webtoon) modes.
  - Left-to-right (Western) and Right-to-left (Manga) reading directions.
  - **Dynamic Filters**: Independent sliders for Brightness, Contrast, Saturation, Invert, and Tone (Sepia/Grayscale).
  - **Auto-Advance**: Smart timer with a decreasing progress countdown that resets on manual page flips.
  - Page bookmarks and progress tracking saved to your user account.
- **User Dashboard**: Real-time reading statistics (started, completed, pages read, time spent).
- **Admin Dashboard**: Centralized control for library scanning (4 modes: Incremental, Full, Thumbnails, Metadata), user management (approval flows), and system settings.
- **Dark/Light Themes**: Customizable interface with persistent user preferences.
- **Global Visual Tuning**: Set your baseline Brightness, Contrast, Saturation, and Tone (Sepia/Grayscale) in your user profile; these apply automatically to every comic you read.
- **Smart Precedence Logic**: Direction, Display Mode, and Zoom are remembered per-comic to suit specific artistic styles, while visual filters remain consistent across your library for a stable reading environment.

## Technical Considerations

### Security
- **Authentication**: Secure password hashing using `bcrypt` with lazy migration from legacy formats.
- **Session Management**: Secure session tracking via HTTP-only, SameSite cookies with 30-day expiry.
- **Admin Hardening**: Forced password change for default credentials and environment-based admin setup.
- **Access Control**: Administrative routes (scanning, user management) are protected by role-based authorization.
- **SQL Safety**: Comprehensive use of parameterized queries to prevent SQL injection.
- **Path Traversal Protection**: Securely serves comic files while preventing unauthorized access to the filesystem.

### Scalability & Architecture
- **Modular Design**: Refactored backend and frontend into logical packages (`db/`, `scanner/`, `library/`) for maintainability.
- **Structured Logging**: Centralized logging system with console output and rotating file backups.
- **Portable Configuration**: Full support for environment variables via `.env` files.
- **Large Libraries**: Optimized to support 10k+ comics with efficient SQLite WAL-mode queries.
- **Background Processing**: Multi-threaded library scanning and thumbnail generation.

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

## TODO & Roadmap

For a detailed list of planned features, known bugs, and project roadmap, please see [TODO.md](TODO.md).

## Recent Changes

### 2026-02-13
- **Unified Series Page**: Unified all "View Series" entry points into the main library Title View, ensuring consistent view modes, sorting, and selection capabilities.
- **Smart Synopsis & Illumination**: Redesigned series descriptions with an "illumination" (floated cover image) and conditional retraction that only clamps if the text exceeds the height of the metadata column.
- **Enhanced Metadata Rendering**: Integrated series banners directly into the metadata box and added a fallback to use the first chapter's cover as the series illumination when custom metadata is missing.
- **Volume-First Natural Sort**: Refined sorting logic to always prioritize Volumes before individual Chapters/Units in natural alphabetical order.
- **Global View Consistency**: Added selection checkboxes to List and Detailed view modes and synced sort/view controls across all discovery and filtering views.
- **Discovery Covers Fix**: Fixed suggestions carousel showing broken cover images — SQL now validates `cover_comic_id` references and falls back to earliest comic; frontend renders CSS placeholder for series with no thumbnails.
- **Comic-Book-Cover Folder Cards**: Library folder cards redesigned from boxy horizontal layout to tall comic-cover-shaped cards with gradient backgrounds, fan hover animation (`scale(1.15)`, cubic-bezier transition), and descriptive sample titles ("Ranma ½, Rurouni Kenshin and 42 more").
- **Details View Title Links**: Detailed view now shows up to 5 clickable links to the most voluminous titles within each category/subcategory, sorted by comic count, with a "+ XX more" link to navigate deeper.
- **Search Hit Location Badges**: Search results (scope: "everywhere") now display purple pill badges indicating where the match was found (Title, Synopsis, Author, Alt Title, Tags).
- **Finder-Style Sidebar Tree**: Replaced flat sidebar with a recursive Mac Finder-style tree — categories, subcategories, and individual titles expand/collapse via arrow icons. Auto-expands to current location. Leaf title nodes styled distinctly (smaller, italic).
- **Tags View Parity**: Tag cards now use the same comic-cover-shaped card style as library folders, with randomized sample series names, fan cover art, and clickable series links in detailed view.

### 2026-02-11
- **Touch UI Improvements (WIP)**: Reader header/footer/scrubber now hides on touch devices when advancing pages via swipe or tap zones. Added pull tab toggle for manual show/hide. Pointer event handlers no longer re-show UI on touch interactions.
- **E-Reader Light Mode Fix**: Fixed invisible "Scan Database" buttons in e-reader light mode by adding missing `--danger` and `--danger-low` CSS variables across all theme variants.
- **Rating System Fix**: Fixed "apiPost is not defined" error when rating a series — added missing `apiPost` import in `library.js`.
- **Series Navigation from Reader**: Added a "Series" button to the reader header bar, allowing direct navigation to the series detail page from within the reader (useful when launched via "Continue Reading").

### 2026-02-07
- **Admin Overhaul**: Consolidated all admin functions into a single dashboard.
- **Tag Management System**: 
  - **Unified Modifications**: New system to blacklist, rename, or merge tags from a single interface.
  - **Advanced Normalization**: Implementation of accent-insensitive, punctuation-blind, and automatic singularization logic (e.g., "Video Games" and "video-game" are now identical).
  - **Recursive Merging**: Support for complex merge chains with automatic count attribution.
  - **Tag Insights**: Hover over active tags in the admin panel to see exactly which series they match.
- **System Controls**:
  - **Library Reload**: Force invalidation and reconstruction of all metadata caches.
  - **Restart Server**: Gracefully restart the backend process to pick up code edits without manual terminal intervention.
- **Scan Modes**: Added 4 distinct scan types (Incremental, Full, Thumbnails, Metadata).
- **Thumbnail Engine**: New "Pick Best" mode automatically selects the smallest file among WebP, PNG, and JPG. Configurable quality and resolution.
- **User Approval**: Added optional administrator approval gate for new registrations.
- **Reading Stats**: Admin user table now shows time spent reading and comics completed per user.
- **Mobile Responsive Fixes**: Resolved critical layout bugs in the Tags view on narrow screens.

### 2026-02-06 (Bug Fixes)
- **View Mode Fix**: Fixed view mode switching (grid/list/detailed) not working in Tags view.
- **Search Filters**: Fixed filters (genre, status, read progress) not being applied in search mode.
- **Visual Filter API**: Fixed visual filter sliders spamming API calls on every movement - now only saves on release.
- **E-Reader Badge Color**: Fixed chapter badge text color in e-reader dark mode (was white-on-white).
- **Synopsis Toggle**: Fixed double arrow bug in synopsis toggle on title detail view.
- **Tags Clicking**: Fixed clicking on tag cards not adding them to filter list.
- **Preferences UI**: Fixed preferences modal not showing current values when opened.
- **Library Loading**: Fixed library only showing first 100 comics instead of entire collection.
### 2026-02-06
- **Unified Selection & Export**: Integrated the batch selection system into the Tags view, allowing users to select and export series found via tag filtering. Improved navigation logic to persist selections during tag drill-down.
- **Accurate Chapter Counting**: Replaced metadata-based chapter counts in the Tags view with real-time disk-based counting for 100% accuracy.
- **Metadata-Prioritized Sidebar**: Updated the navigation sidebar to use series metadata titles and enforced alphabetical sorting at all levels for a more predictable browsing experience.
- **Dynamic Filter Propagation**: Redesigned library filters to be context-aware, showing only when viewing titles and dynamically narrowing options based on active filters to ensure zero-result states are avoided.
- **Contextual Navigation Sidebar**: Overhauled the sidebar to show the "one level up" hierarchy relative to the current view, providing a stable navigational guide that remains visible even in detailed title views.
- **UI Logic Optimization**: Automatically hide non-applicable controls (like the Flatten toggle) when viewing specific titles or chapters to reduce UI clutter.
- **Global Preference Sync**: Expanded the user profile system to persist all visual filters (Brightness, Contrast, Saturation, Invert, Tone) and auto-advance settings across devices.
- **Intelligent Precedence**: Refined the reader to balance per-comic memory (for layout) with global defaults (for environment), ensuring a consistent experience without manual re-adjustment.
- **E-Reader Mode**: Launched a dedicated high-contrast mode that eliminates all shadows, rounded corners, and transitions for a "cleanly lined" aesthetic.
- **Expanded Visual Engine**: Implemented independent hardware-accelerated filters for Brightness, Contrast, Saturation, Inversion, and Tone (Sepia/Grayscale) with a consolidated "Reset All" control.
- **Auto-Advance Progress**: Added a dynamic decreasing countdown bar that reposition based on UI visibility and resets on manual navigation.
- **Performance & UX**: Optimized slider persistence to be "network-quiet" during movement and implemented in-place UI updates for the preferences modal to eliminate jarring reloads.
- **UI Compression**: Refactored the preferences and reader settings into a compact horizontal layout, significantly reducing vertical footprint.
- **ESLint/Prettier**: Code quality tooling
- **✨ Discovery Views**: Where: Click the "✨ Discover" button in the top navigation bar (between Library and Recent)
  - New Additions carousel - Shows recently added comics to your library
  - Tag-based suggestions
- **PWA Support (Browser Feature)**: Install the app from your browser
  - Chrome/Edge: Click the install icon in the address bar (➕ or 📱 icon)
  - Safari: Use "Add to Home Screen" from the share menu
  - Result: App becomes installable with offline support
- **Page Annotations (Backend Only)**:  Backend infrastructure complete, but no UI yet
  - API endpoints exist at /api/annotations/*
  - Database schema supports notes and highlights
  - Not visible yet - would need reader UI integration
- **Duplicate Detection (Admin Only)** : dashboard → Coming soon section
  - API at /api/admin/duplicates
  - Shows duplicate comics by file hash or size+filename
- **Multi-Library (Backend Only)**: Backend infrastructure complete
  - Supports multiple comic directories
  - Admin API at /api/libraries
  - Not visible yet - would need UI for switching libraries

### 2026-02-05
- **Security Hardening**: Migrated to `bcrypt` hashing with lazy migration, audited and fixed all SQL queries for full parameterization, and hardened registration logic.
- **Phase 2 Completion**: 
    - **User Profile**: Central view for account settings, stats dashboard, and password changes.
    - **Deep Search**: Implemented SQLite FTS5 for full-text search across synopses and authors.
    - **Background Export**: New UUID-based background zipper with progress modal, cancellation, and heartbeat zombie cleanup.
    - **Ratings**: 5-star rating system for series.
    - **Selection Mode**: Context-aware selection for series or individual chapters.
    - **Live Filters**: Added UI dropdowns for Genre, Status, and Progress filtering.
    - **Gap Detection**: Admin tool to find missing volumes or chapters in sequences.
- **Performance & Stability**:
    - **Boot Warming**: Pre-calculates tag metadata and search index on startup.
    - **Logic Consolidation**: Eliminated redundant API calls during the boot sequence for 2x faster loads.
- **Admin & Setup**: Implemented forced password changes for default accounts, supported environment-based admin credentials, and added a non-dismissible security update flow.
- **Modular Architecture**: Refactored monolithic files (`database.py`, `scanner.py`, `library.js`) into clean, maintainable packages (`db/`, `scanner/`, `library`)
- **User Management**: Added a full-stack administrative dashboard for managing user roles, deletions, and forced password resets.
- **Infrastructure**: Integrated `python-dotenv` for portable configuration, implemented structured logging (Console + Rotating File), and added randomized secret key fallbacks.
- **Format Support**: Added support for **Jpeg XL (.jxl)** image archives with automatic MIME type detection and proper content-type responses.
- **Optimized Tagging**: Implemented a high-performance tagging system with a 128x speedup using module-level caching and word-set tokenization.
- **Reading History**: Added ability to purge entire reading history or remove individual items from the "Recent" tab.
- **Export System**: Implemented backend for streaming multi-comic exports as CBZ files using zero-compression for speed.
- **Reader Enhancements**: 
  - **Performance**: Added background preloading for the next 2-3 pages.
  - **Gestures**: Implemented native mobile gestures for swipes and pinch-to-zoom.
  - **Per-Comic Memory**: Reader now remembers specific settings (zoom, direction) for each title.
  - **Utility**: Added session/series time tracking and custom remappable keybindings. 
  - **Sliders and Adjustments**: Readability (sepia, gray, invert, contrast, color); auto-advance
  
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
