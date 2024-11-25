
export function showLoadingIndicator() {
    let loader = document.querySelector('.loading-indicator');
    if (!loader) {
        loader = document.createElement('div');
        loader.className = 'loading-indicator';
        loader.innerHTML = `
            <div class="loading-spinner"></div>
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