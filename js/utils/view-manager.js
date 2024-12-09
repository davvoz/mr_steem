export function hideAllViews() {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
}

export function showView(templateId) {
    const view = document.getElementById(templateId);
    if (!view) {
        console.error(`View ${templateId} not found`);
        return;
    }
    
    view.style.display = 'block';
}