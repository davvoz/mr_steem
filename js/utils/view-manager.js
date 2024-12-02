const FADE_DURATION = 300;

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

export async function fadeView(templateId, direction) {
    const view = document.getElementById(templateId);
    if (!view) return;

    return new Promise(resolve => {
        const opacity = direction === 'in' ? '1' : '0';
        
        // Setup transition
        view.style.transition = `opacity ${FADE_DURATION}ms ease-in-out`;
        
        // Trigger animation
        requestAnimationFrame(() => {
            view.style.opacity = opacity;
            
            // Cleanup and resolve
            setTimeout(() => {
                view.style.transition = '';
                resolve();
            }, FADE_DURATION);
        });
    });
}