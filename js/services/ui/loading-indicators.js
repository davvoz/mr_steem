export function showLoadingIndicator() {
    let loader = document.querySelector('.loading-indicator');
    if (!loader) {
        loader = document.createElement('div');
        loader.className = 'loading-indicator';
        loader.innerHTML = `
            <div class="spinner">
                <svg viewBox="0 0 50 50">
                    <circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                </svg>
            </div>
            <p>Loading posts...</p>
        `;
        const container = document.getElementById('posts-container');
        if (container) {
            container.appendChild(loader);
        }
    }
}

export function hideLoadingIndicator() {
    const loader = document.querySelector('.loading-indicator');
    if (loader) loader.remove();
}

export function showProfileLoadingIndicator() {
    const indicator = document.querySelector('.profile-loading-indicator');
    if (indicator) indicator.style.display = 'block';
}

export function hideProfileLoadingIndicator() {
    const indicator = document.querySelector('.profile-loading-indicator');
    if (indicator) indicator.style.display = 'none';
}

export function showNotificationLoadingIndicator() {
    const container = document.querySelector('.notifications-list');
    if (!container) return;

    const loader = document.createElement('div');
    loader.className = 'notification-loading-indicator';
    loader.innerHTML = `
        <div class="spinner">
            <svg viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
            </svg>
        </div>
        <p>Loading more notifications...</p>
    `;
    container.appendChild(loader);
}

export function hideNotificationLoadingIndicator() {
    const loader = document.querySelector('.notification-loading-indicator');
    if (loader) {
        loader.remove();
    }
}