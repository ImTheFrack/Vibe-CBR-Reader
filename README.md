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

## TODO & Roadmap

For a detailed list of planned features, known bugs, and project roadmap, please see [TODO.md](TODO.md).

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
