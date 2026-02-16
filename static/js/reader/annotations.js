import { state } from '../state.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../api.js';
import { showToast } from '../utils.js';

export async function loadAnnotations(comicId) {
  if (!state.isAuthenticated) {
    state.currentAnnotations = [];
    return;
  }
  const result = await apiGet(`/api/annotations/${comicId}`);
  if (!result.error && Array.isArray(result)) {
    state.currentAnnotations = result;
  } else {
    state.currentAnnotations = [];
  }
}

export function toggleAnnotationPanel() {
  const panel = document.getElementById('annotation-panel');
  if (!panel) return;

  state.annotationPanelVisible = !state.annotationPanelVisible;
  panel.classList.toggle('open', state.annotationPanelVisible);
}

export function updateAnnotationPageLabel() {
  const label = document.getElementById('annotation-page-label');
  if (label) {
    label.textContent = `Page ${state.currentPage + 1}`;
  }
}

export function setupAnnotationPanelListeners() {
  const noteInput = document.getElementById('annotation-note-input');
  if (noteInput) {
    noteInput.addEventListener('input', () => {
    });
    noteInput.addEventListener('focus', () => {
    });
  }
}

export async function addAnnotation() {
  if (!state.isAuthenticated) {
    showToast('Please log in to add annotations', 'error');
    return;
  }
  if (!state.currentComic) return;

  const noteInput = document.getElementById('annotation-note-input');
  const note = noteInput ? noteInput.value.trim() : '';

  if (!note) {
    showToast('Please enter a note', 'error');
    return;
  }

  const result = await apiPost('/api/annotations', {
    comic_id: state.currentComic.id,
    page_number: state.currentPage,
    note: note
  });

  if (result.error) {
    showToast('Failed to add annotation', 'error');
  } else {
    showToast('Annotation added!', 'success');
    if (noteInput) noteInput.value = '';
    await loadAnnotations(state.currentComic.id);
  }
}

export async function deleteAnnotation(annotationId) {
  if (!state.isAuthenticated || !state.currentComic) return;

  const result = await apiDelete(`/api/annotations/${annotationId}`);
  if (result.error) {
    showToast('Failed to delete annotation', 'error');
  } else {
    showToast('Annotation deleted', 'success');
    await loadAnnotations(state.currentComic.id);
  }
}

export function editAnnotation(annotationId) {
  const annotation = state.currentAnnotations.find(a => a.id === annotationId);
  if (!annotation) return;

  const noteInput = document.getElementById('annotation-note-input');
  if (noteInput) {
    noteInput.value = annotation.note || '';
    noteInput.focus();
    noteInput.dataset.editId = annotationId;
  }
}

export async function updateAnnotation(annotationId) {
  if (!state.isAuthenticated) return;

  const noteInput = document.getElementById('annotation-note-input');
  const note = noteInput ? noteInput.value.trim() : '';

  if (!note) {
    showToast('Please enter a note', 'error');
    return;
  }

  const result = await apiPut(`/api/annotations/${annotationId}`, {
    note: note
  });

  if (result.error) {
    showToast('Failed to update annotation', 'error');
  } else {
    showToast('Annotation updated!', 'success');
    if (noteInput) {
      noteInput.value = '';
      delete noteInput.dataset.editId;
    }
    await loadAnnotations(state.currentComic.id);
  }
}

export function renderAnnotationsList() {
  const list = document.getElementById('annotation-list');
  if (!list) return;

  const annotations = state.currentAnnotations;

  if (annotations.length === 0) {
    list.innerHTML = '<div class="annotation-empty">No annotations for this comic</div>';
    return;
  }
}

export function updateAnnotationButtonUI() {
  const btn = document.getElementById('annotation-btn');
  if (!btn) return;

  const pageAnnotations = state.currentAnnotations.filter(a => a.page_number === state.currentPage);
  const hasAnnotations = pageAnnotations.length > 0;
  const count = pageAnnotations.length;

  btn.classList.toggle('has-annotations', hasAnnotations);

  let badge = btn.querySelector('.annotation-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'annotation-badge';
      btn.appendChild(badge);
    }
    badge.textContent = count;
    badge.style.display = 'flex';
  } else if (badge) {
    badge.style.display = 'none';
  }
}
