
// Toggle Synopsis Function
window.toggleSynopsis = function(id) {
    const textEl = document.getElementById(`synopsis-${id}`);
    const btn = event.target; // Simple access to clicked element
    
    if (textEl) {
        textEl.classList.toggle('expanded');
        const isExpanded = textEl.classList.contains('expanded');
        btn.textContent = isExpanded ? '▲' : '▼';
    }
};

// Toggle Mobile Search Bar
window.toggleMobileSearch = function(active) {
    const searchBox = document.getElementById('header-search-box');
    if (searchBox) {
        searchBox.classList.toggle('mobile-active', active);
        if (active) {
            const input = searchBox.querySelector('.search-input');
            if (input) input.focus();
        }
    }
};
