
import { extractImageFromContent, cleanImageUrl } from './post-utils.js';

export class PostRenderer {
    static renderPostList(posts, containerId, append = false) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const postsHTML = posts.map(post => this.renderPostCard(post)).join('');

        if (append) {
            container.insertAdjacentHTML('beforeend', postsHTML);
        } else {
            container.innerHTML = postsHTML;
        }
    }

    static renderPostCard(post) {
        // ...existing code for renderPostCard...
    }

    static renderSinglePost(post) {
        // ...existing code for renderSinglePost...
    }
}