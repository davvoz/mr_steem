
import { avatarCache } from '../utils/avatar-cache.js';
import { checkIfVoted, showVoters } from '../services/vote-manager.js';

export async function renderPosts(steemPosts, containerId = 'posts-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    for (const post of steemPosts) {
        const postElement = await createPostElement(post);
        container.appendChild(postElement);
    }
}

async function createPostElement(post) {
    const postElement = document.createElement('div');
    postElement.className = 'post';
    
    const imgRegex = /<img[^>]+src="([^">]+)"/;
    const imgMatch = post.body.match(imgRegex);
    const imageUrl = imgMatch ? imgMatch[1] : 'https://via.placeholder.com/500';
    const avatarUrl = avatarCache.get(post.author);
    
    const hasVoted = await checkIfVoted(post.author, post.permlink);
    const heartClass = hasVoted ? 'fas fa-heart text-danger' : 'far fa-heart';

    postElement.innerHTML = `
        <div class="post-header">
            <div class="avatar">
                <img src="${avatarUrl}" alt="${post.author}" 
                     style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
            </div>
            <div>${post.author}</div>
        </div>
        <!-- ...rest of post HTML... -->
    `;

    // Add event listeners and initialize tooltips
    const votesCountElement = postElement.querySelector('.votes-count');
    showVoters(post.author, post.permlink, votesCountElement);

    return postElement;
}