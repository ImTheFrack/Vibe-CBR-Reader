import { state } from '../state.js';
import { apiGet, apiPost, apiPut, apiDelete } from '../api.js';
import { showToast } from '../utils.js';
import { setPreference } from '../preferences.js';
import * as router from '../router.js';
import { prefetchManager } from './prefetch.js';

let sessionStartTime = null;

export function getSessionStartTime() {
  return sessionStartTime;
}

export function setSessionStartTime(time) {
  sessionStartTime = time;
}

export function createReaderImage(src) {
  const loading = document.getElementById('reader-loading');
  const cachedImg = prefetchManager.getCachedImage(src);
  let img;

  if (cachedImg) {
    img = cachedImg.cloneNode();
    if (loading) loading.classList.remove('active');
  } else {
    if (loading) loading.classList.add('active');
    img = document.createElement('img');
    img.src = src;

    img.onload = () => {
      if (loading) loading.classList.remove('active');
    };

    img.onerror = () => {
      if (loading) loading.classList.remove('active');
      showToast('Failed to load page', 'error');
    };
  }

  img.className = 'reader-image';
  img.alt = 'Comic page';

  return img;
}

export function applyImageZoom(img, zoom) {
  if (zoom === 'width') {
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.maxWidth = '100%';
    img.style.maxHeight = 'none';
    img.style.objectFit = 'contain';
  } else if (zoom === 'height') {
    img.style.width = 'auto';
    img.style.height = '100%';
    img.style.maxWidth = 'none';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
  } else {
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
  }
}
