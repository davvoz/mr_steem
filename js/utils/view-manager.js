
export function hideAllViews() {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
}

export function showView(viewId) {
    const view = document.getElementById(viewId);
    if (view) {
        view.style.display = 'block';
    } else {
        console.error(`View with id ${viewId} not found`);
    }
}