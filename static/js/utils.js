import { state } from './state.js';

/**
 * Debounce utility - delays function execution until after specified delay
 * Cancels pending execution if called again before delay expires
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay) {
     let timeoutId;
     return function(...args) {
         clearTimeout(timeoutId);
         timeoutId = setTimeout(() => fn.apply(this, args), delay);
     };
}

export function showToast(message, type = 'success') {
     const container = document.getElementById('toast-container');
     const toast = document.createElement('div');
     toast.className = `toast ${type}`;
     const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
     toast.innerHTML = `
         <span>${icon}</span>
         <span>${message}</span>
     `;
     container.appendChild(toast);
     
     setTimeout(() => {
         toast.remove();
     }, 3000);
}

/**
 * Helper to find a title object by name anywhere in the folder tree
 */
export function findTitleInTree(titleName) {
     if (!state.folderTree) return null;
     const lowerName = titleName.toLowerCase();
     for (const cat of Object.values(state.folderTree.categories || {})) {
         for (const sub of Object.values(cat.subcategories || {})) {
             if (sub.titles && sub.titles[titleName]) return sub.titles[titleName];
             if (sub.titles) {
                 for (const title of Object.values(sub.titles)) {
                     if (title.name.toLowerCase() === lowerName) return title;
                 }
             }
         }
     }
     return null;
}

/**
 * Helper to update select element options dynamically
 */
export function updateSelectOptions(elementId, options, currentValue, defaultText) {
     const select = document.getElementById(elementId);
     if (!select) return;

     // Keep "All" option
     let html = `<option value="">${defaultText}</option>`;
     
     // Add options
     options.forEach(opt => {
         const isSelected = opt === currentValue ? 'selected' : '';
         html += `<option value="${opt}" ${isSelected}>${opt}</option>`;
     });

     select.innerHTML = html;
     
     // If the previously selected value is gone, update state
     if (currentValue && !options.includes(currentValue)) {
         const filterKey = elementId.replace('filter-', '').replace('tag-filter-', '');
         if (select.value !== state.filters[filterKey]) {
              state.filters[filterKey] = select.value;
         }
     }
}
