import { cleanPostContent } from './post-utils.js';

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

export function generatePostFooter(post) {
    const tags = JSON.parse(post.json_metadata)?.tags || [];
    
    return `
        <footer class="post-footer">
            <div class="post-stats">
                <span class="votes-container">
                    <i class="far fa-heart"></i> 
                    <span class="net_votes clickable" 
                          data-post-author="${post.author}" 
                          data-post-permlink="${post.permlink}">
                        ${post.net_votes} likes
                    </span>
                </span>
                <span class="comments-container">
                    <i class="far fa-comment"></i> 
                    <span class="comments-count clickable" 
                          data-post-author="${post.author}" 
                          data-post-permlink="${post.permlink}">
                        ${post.children} comments
                    </span>
                </span>
                <span>
                    <i class="fas fa-dollar-sign"></i> 
                    ${parseFloat(post.pending_payout_value).toFixed(2)} payout
                </span>
            </div>
            <div class="post-tags">
                ${tags.map(tag => `
                    <a href="#/tag/${tag}" class="tag">#${tag}</a>
                `).join(' ')}
            </div>
        </footer>
    `;
}