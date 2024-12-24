import { scrollManager } from './scroll-manager.js';

export function hideAllViews() {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
    scrollManager.resetScroll();
}

export function showView(viewId) {
    const view = document.getElementById(viewId);
    if (view) {
        view.style.display = 'block';
        scrollManager.enableScroll();
        // Force layout recalculation
        view.offsetHeight;
    }
}