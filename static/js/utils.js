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
     if (!container) return;
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

/**
 * Sanitizes and parses metadata fields that might be lists, JSON strings, or malformed "[]"
 * @param {any} field - The metadata field value to parse
 * @returns {Array<string>} A clean array of strings
 */
export function parseMetadataField(field) {
    if (!field) return [];
    
    // If it's already an array, clean each item
    if (Array.isArray(field)) {
        const result = [];
        field.forEach(item => {
            const parsed = parseMetadataField(item);
            result.push(...parsed);
        });
        return [...new Set(result)].filter(t => t && t !== '[]');
    }
    
    // If it's a string, handle JSON or literal "[]"
    if (typeof field === 'string') {
        const trimmed = field.trim();
        if (!trimmed || trimmed === '[]') return [];
        
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                return parseMetadataField(parsed);
            } catch (e) {
                // If it looks like JSON but isn't, just treat as string
            }
        }
        
        // Final cleanup for single string tags
        const clean = trimmed.replace(/^["']|["']$/g, '').trim();
        return clean && clean !== '[]' ? [clean] : [];
    }
    
    return [String(field)];
}

/**

 * Removes accents/diacritics from a string

 * @param {string} str - The string to deburr

 * @returns {string} The deburred string

 */

export function deburr(str) {

    if (!str) return "";

    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

}



/**



 * Simple singularization matching the backend logic.



 * @param {string} word 



 * @returns {string}



 */



export function singularize(word) {



    if (!word || word.length <= 3) return word;



    



    const exceptions = ['series', 'species', 'class', 'business', 'status', 'canvas', 'glass', 'grass', 'boss', 'less', 'tennis', 'hypnosis'];



    if (exceptions.includes(word.toLowerCase())) return word;







    // Handle common patterns like /s



    word = word.replace(/\/s$/i, '').replace(/\(s\)$/i, '');







    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';



    if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('ches') || word.endsWith('shes')) return word.slice(0, -2);



    if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);



    



    return word;



}







/**



 * Aggressively normalizes a tag for searching/comparison (lowercase, no accents, no punctuation)



 * @param {string} str 



 * @returns {string}



 */



export function normalizeTag(str) {



    if (!str) return "";



    // Lowercase + accents



    let t = deburr(str.toLowerCase());



    // Punctuation to space



    t = t.replace(/[^a-z0-9]/g, ' ');



    // Clean up spaces



    let words = t.split(' ').filter(w => w);



    if (words.length > 0) {



        // Singularize last word



        words[words.length - 1] = singularize(words[words.length - 1]);



    }



    return words.join(' ');



}




