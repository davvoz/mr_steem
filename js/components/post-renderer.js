
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
        <div class="post-image">
            <img src="${imageUrl}" alt="Post image">
        </div>
        <div class="post-body">
            <h3>${post.title}</h3>
            <p>${post.body}</p>
        </div>
        <div class="post-footer">
            <div class="votes-count">
                <i class="${heartClass}"></i>
                <span>${post.active_votes.length}</span>
            </div>
            <div class="comments-count">
                <i class="far fa-comment"></i>
                <span>${post.children}</span>
            </div>
        </div>
        
    `;

    // Add event listeners and initialize tooltips
    const votesCountElement = postElement.querySelector('.votes-count');
    showVoters(post.author, post.permlink, votesCountElement);

    return postElement;
}