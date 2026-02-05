# Phase 3: Reader Enhancements - Implementation Plan

This document outlines the detailed, step-by-step plan for implementing Phase 3 of the Vibe CBR Reader roadmap.

## 1. Performance & Preloading (`PrefetchManager`)

### Goal
Replace the basic one-page preloader with a robust `PrefetchManager` that intelligently caches upcoming and previous pages to ensure near-instant page turns.

### Steps
1.  **Define `PrefetchManager` Class**:
    *   Create a class in `static/js/reader.js` (or `static/js/utils/prefetch.js`).
    *   Maintain a `Map` of `url` -> `Image object` for caching.
    *   Maintain an `AbortController` (or simple queue) to stop loading images that are no longer relevant (e.g., after a large jump).
2.  **Logic**:
    *   When a page `N` is loaded:
        *   Preload pages `N+1`, `N+2`, `N+3`.
        *   Preload page `N-1` (for smooth back navigation).
    *   Limit cache size (e.g., 10 images) to prevent excessive memory usage.
3.  **Integration**:
    *   Update `loadPage()` to check `PrefetchManager` before creating a new `Image` element.
    *   Update `createReaderImage()` to utilize the cached Image objects if available.

## 2. Mobile Navigation Gestures (`GestureController`)

### Goal
Provide native-feeling touch interactions for mobile users, including swiping for page turns and pinch-to-zoom.

### Steps
1.  **Define `GestureController` Class**:
    *   Handle `pointerdown`, `pointermove`, and `pointerup` events on the `#reader-viewport`.
    *   Track touch points for multi-touch gestures.
2.  **Swipe Detection**:
    *   Detect horizontal delta and velocity.
    *   Trigger `nextPage()` or `prevPage()` when a threshold is met.
    *   Add a subtle CSS transition/transform during the swipe to provide visual feedback.
3.  **Pinch-to-Zoom**:
    *   Calculate distance between two touch points.
    *   Apply `transform: scale(s) translate(x, y)` to the active page image.
    *   Ensure zoom state is reset or maintained correctly when turning pages.

## 3. Reading Environment

### A. Per-Comic Settings Memory
### Goal
Remember specific display settings (direction, zoom, mode) for each comic individually.

### Steps
1.  **Database Migration**:
    *   Update `database.py`: Add `reader_display`, `reader_direction`, and `reader_zoom` columns to the `reading_progress` table.
2.  **API Updates**:
    *   Update `routes/users.py`: Modify `ReadingProgressUpdate` Pydantic model and `update_reading_progress` function to accept these new fields.
    *   Ensure `get_reading_progress` returns these fields.
3.  **Frontend Integration**:
    *   When starting a comic, if `user_progress` contains these settings, override the global defaults in `state.settings`.
    *   When a setting is changed while the reader is open, save it immediately to the comic's progress record via `POST /api/progress`.

### B. Visual Navigation (Scrubber)
### Goal
Add a horizontal thumbnail-based navigation bar for rapid seeking.

### Steps
1.  **UI Component**:
    *   Create a `#reader-scrubber` div at the bottom of the reader UI.
    *   Implement a horizontal scrollable container.
2.  **Thumbnail Generation**:
    *   Reuse the existing `/api/read/{comic_id}/page/{page_num}` endpoint.
    *   Add a CSS class to scrubber thumbnails to force small dimensions (e.g., `height: 80px`).
3.  **Lazy Loading**:
    *   Use `loading="lazy"` on scrubber thumbnails.
    *   Only render thumbnails near the current scroll position or current page.

### C. Auto-Advance
### Goal
Allow hands-free reading with a configurable timer.

### Steps
1.  **Logic**:
    *   Add `autoAdvanceActive` and `autoAdvanceInterval` to `state.settings`.
    *   Implement a `setInterval` that calls `nextPage()` if the reader is active and not at the end.
2.  **UI**:
    *   Add a toggle and a "Seconds per page" slider in the reader settings panel.
    *   Provide a visual countdown (optional) or pause/play button in the toolbar.

### D. Visual Filters
### Goal
Improve comfort with night mode filters (Brightness/Warmth).

### Steps
1.  **CSS Implementation**:
    *   Apply `filter: brightness(var(--reader-brightness)) sepia(var(--reader-sepia))` to the `#reader-pages` container.
2.  **UI**:
    *   Add sliders for "Brightness" and "Warmth" (Sepia) in the settings panel.
    *   Persist these globally in `user_preferences`.

## 4. Utility

### A. Reading Time Tracking
### Goal
Gather data on how long users spend reading specific titles.

### Steps
1.  **Database Migration**:
    *   Add `seconds_read` (INTEGER DEFAULT 0) to `reading_progress` table.
2.  **Tracking Logic**:
    *   In `reader.js`, start a timer when a comic is opened.
    *   Increment a local counter while the page is visible and active (detect tab visibility).
3.  **Syncing**:
    *   Update the API `POST /api/progress` to accept an `additional_seconds` field.
    *   Send the accumulated time periodically or when the reader is closed.

### B. Custom Keybindings
### Goal
Allow users to remap keyboard shortcuts.

### Steps
1.  **State & Persistence**:
    *   Add a `keybindings` object to `state.settings` with defaults (e.g., `{ next: ['ArrowRight', 'd', ' '], prev: ['ArrowLeft', 'a'] }`).
2.  **UI**:
    *   Create a "Keyboard Shortcuts" section in the preferences modal where users can click a button and press a key to remap.
3.  **Execution**:
    *   Refactor `setupKeyboardShortcuts()` to iterate over the `keybindings` map instead of hardcoded switch cases.

---

## Implementation Order (Recommended)
1.  **Performance & Preloading**: Highest impact on UX.
2.  **Per-Comic Memory**: Essential for "quality of life".
3.  **Visual Filters**: Easy to implement.
4.  **Mobile Gestures**: Critical for mobile users.
5.  **Time Tracking & Utility**: Value-add features.
6.  **Scrubber & Auto-advance**: Complex UI enhancements.
