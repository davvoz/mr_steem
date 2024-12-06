export function generatePostHtml(post) {
    return marked.parse(post.body, {
        breaks: true,
        sanitize: false,
        gfm: true,
        headerIds: false
    });
}

export function generatePostHeader(post, avatarUrl, postDate) {
    return `
        <header class="post-header">
            <div class="author-info">
                <img src="${avatarUrl}" alt="${post.author}" class="author-avatar">
                <div class="author-details">
                    <a href="#/profile/${post.author}" class="author-name">@${post.author}</a>
                    <span class="post-date">${postDate}</span>
                </div>
            </div>
        </header>
    `;
}

export function generatePostContent(post, htmlContent) {
    return `
        <div class="post-content">
            <h1 class="post-title">${post.title}</h1>
            <div class="post-body markdown-content">
                ${htmlContent}
            </div>
        </div>
    `;
}

// Aggiungi questa funzione globale per gestire i click sui tag
window.handleTagClick = function(event, tag) {
    event.preventDefault();
    event.stopPropagation();
    window.location.hash = `/tag/${tag}`;
};