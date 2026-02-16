import { state } from '../state.js';
import { apiGet, apiPost } from '../api.js';

let sessionStartTime = null;

export function setSessionStartTime(time) {
  sessionStartTime = time;
}

export function getSessionStartTime() {
  return sessionStartTime;
}

export async function loadProgressFromAPI(comicId) {
  if (!state.isAuthenticated) return null;
  const result = await apiGet(`/api/progress/${comicId}`);
  if (!result.error) {
    return {
      page: result.current_page,
      completed: result.completed,
      lastRead: new Date(result.last_read).getTime(),
      reader_display: result.reader_display,
      reader_direction: result.reader_direction,
      reader_zoom: result.reader_zoom,
      seconds_read: result.seconds_read
    };
  }
  return null;
}

export async function saveProgressToAPI(additionalSeconds = 0) {
  if (!state.isAuthenticated || !state.currentComic) return;
  const progressData = {
    comic_id: state.currentComic.id,
    current_page: state.currentPage,
    total_pages: state.totalPages,
    completed: state.currentPage >= state.totalPages - 1,
    reader_display: state.settings.display,
    reader_direction: state.settings.direction,
    reader_zoom: state.settings.zoom,
    additional_seconds: additionalSeconds
  };

  state.readingProgress[state.currentComic.id] = {
    ...state.readingProgress[state.currentComic.id],
    page: state.currentPage,
    lastRead: Date.now(),
    completed: progressData.completed,
    reader_display: progressData.reader_display,
    reader_direction: progressData.reader_direction,
    reader_zoom: progressData.reader_zoom
  };

  const result = await apiPost('/api/progress', progressData);
  if (result.error && result.status !== 401) {
    console.error('Failed to save progress:', result.error);
  }
}

export function saveProgress() {
  if (!state.currentComic) return;

  let additionalSeconds = 0;
  if (sessionStartTime) {
    additionalSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
    sessionStartTime = Date.now();
  }

  state.readingProgress[state.currentComic.id] = {
    ...state.readingProgress[state.currentComic.id],
    page: state.currentPage,
    lastRead: Date.now(),
    completed: state.currentPage >= state.totalPages - 1
  };
  saveProgressToAPI(additionalSeconds);
}
