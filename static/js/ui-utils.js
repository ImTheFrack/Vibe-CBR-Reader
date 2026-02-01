
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
