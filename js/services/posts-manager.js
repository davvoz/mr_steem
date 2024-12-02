import { steemConnection } from '../auth/login-manager.js';
import { avatarCache } from '../utils/avatar-cache.js';
import { extractProfileImage, extractImageFromContent } from './post/post-utils.js';
import {  showProfileLoadingIndicator, hideProfileLoadingIndicator 
} from './ui/loading-indicators.js';
let isLoadingProfile = false;
let hasMoreProfilePosts = true;

const seenPosts = new Set(); 
const globalPostsCache = {
    home: new Map(),
    profile: new Map()
};

const processedPostIds = new Set();

let lastPost = null;
let isLoading = false;
let hasMore = true;

const STEEM_API_URLS = [
    'https://api.steemit.com',
    'https://api.hive.blog',
    'https://api.hivekings.com',
    'https://anyx.io',
    'https://api.openhive.network'
];

let currentApiUrl = 0;

async function initSteemConnection() {
    while (currentApiUrl < STEEM_API_URLS.length) {
        try {
            steem.api.setOptions({ url: STEEM_API_URLS[currentApiUrl] });
            // Test the connection
            await steem.api.getDynamicGlobalPropertiesAsync();
            console.log('Connected to Steem API:', STEEM_API_URLS[currentApiUrl]);
            return true;
        } catch (error) {
            console.warn(`Failed to connect to ${STEEM_API_URLS[currentApiUrl]}, trying next...`);
            currentApiUrl++;
        }
    }
    throw new Error('Failed to connect to any Steem API endpoint');
}

export async function loadHomeFeed(append = false) {
    if (isLoading || !hasMore) return;
    
    try {
        isLoading = true;
        showProfileLoadingIndicator();

        // Ensure Steem connection is initialized
        await initSteemConnection();

        const query = {
            tag: 'photography', // Default tag if not logged in
            limit: 20,
        };

        if (lastPost) {
            query.start_author = lastPost.author;
            query.start_permlink = lastPost.permlink;
        }

        // Use getDiscussionsByCreated instead of getDiscussionsByFeed for more reliable results
        const posts = await steem.api.getDiscussionsByCreatedAsync(query);
        
        if (!posts || posts.length === 0) {
            hasMore = false;
            return;
        }

        // Remove first post if this isn't the first load to avoid duplicates
        const postsToProcess = lastPost ? posts.slice(1) : posts;
        
        if (postsToProcess.length === 0) {
            hasMore = false;
            return;
        }

        // Update last post reference
        lastPost = posts[posts.length - 1];

        // Process and display posts
        await displayPosts(postsToProcess, 'posts-container', append);

        // Setup infinite scroll if not already set
        setupInfiniteScroll();

    } catch (error) {
        console.error('Error loading home feed:', error);
        // Try to reconnect using a different API endpoint
        currentApiUrl++;
        if (currentApiUrl < STEEM_API_URLS.length) {
            console.log('Attempting to reconnect with different API endpoint...');
            await loadHomeFeed(append);
        } else {
            document.getElementById('posts-container').innerHTML += 
                '<div class="error-message">Failed to load posts. <button onclick="window.location.reload()">Retry</button></div>';
        }
    } finally {
        isLoading = false;
        hideProfileLoadingIndicator();
    }
}

function setupInfiniteScroll() {
    if (window._homeScrollHandler) return;

    window._homeScrollHandler = () => {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000) {
            loadHomeFeed(true);
        }
    };

    window.addEventListener('scroll', window._homeScrollHandler);
}

export function resetHomeFeed() {
    lastPost = null;
    isLoading = false;
    hasMore = true;
    seenPosts.clear();
    globalPostsCache.home.clear();
    
    if (window._homeScrollHandler) {
        window.removeEventListener('scroll', window._homeScrollHandler);
        window._homeScrollHandler = null;
    }

    const container = document.getElementById('posts-container');
    if (container) container.innerHTML = '';
}

async function displayPosts(posts, containerId = 'posts-container', append = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let postsHTML = '';

    for (const post of posts) {
        try {
            const [authorAccount] = await steem.api.getAccountsAsync([post.author]);
            const postImage = extractImageFromContent(post);
            let authorImage;
            
            try {
                authorImage = authorAccount ? extractProfileImage(authorAccount) : null;
            } catch (error) {
                console.warn('Failed to parse profile metadata:', error);
                authorImage = null;
            }
            
            // Fix avatar URL template string
            const avatarUrl = authorImage || 
                `https://steemitimages.com/u/${post.author}/avatar/small`;

            // Ensure post title exists
            const safeTitle = post.title || 'Untitled';

            const postHTML = `
                <article class="post" data-permlink="${post.permlink}" data-author="${post.author}">
                    <header class="post-header">
                        <div class="author-avatar-container">
                            <img src="${avatarUrl}" 
                                 alt="${post.author}" 
                                 class="author-avatar"
                                 onerror="this.src='https://steemitimages.com/u/${post.author}/avatar/small'">
                        </div>
                        <a href="#/profile/${post.author}" class="author-name">@${post.author}</a>
                    </header>
                    <div class="post-contento" onclick="window.location.hash='#/post/${post.author}/${post.permlink}'">
                        ${postImage ? `
                            <div class="post-image-container">
                                <img src="${postImage}" 
                                     alt="Post content"
                                     onerror="this.parentElement.style.display='none'">
                            </div>
                            <div class="post-title">
                                <h3>${safeTitle}</h3>
                            </div>
                        ` : `
                            <div class="post-title">
                                <h3>${safeTitle}</h3>
                            </div>
                        `}
                    </div>
                    <footer class="post-actions" onclick="event.stopPropagation()">
                        <span class="post-stat">${parseInt(post.active_votes?.length || 0)} likes</span>
                        <span class="post-stat">${parseInt(post.children || 0)} comments</span>
                    </footer>
                </article>
            `;

            postsHTML += postHTML;
        } catch (error) {
            console.error(`Error processing post from ${post.author}:`, error);
            continue;
        }
    }

    if (append) {
        container.insertAdjacentHTML('beforeend', postsHTML);
    } else {
        container.innerHTML = postsHTML;
    }
}




window.handleVote = async (author, permlink, button) => {
    const success = await votePost(author, permlink);
    if (success) {
        button.classList.add('voted');
        button.disabled = true;
        const voteCount = parseInt(button.innerText.split(' ')[1]) + 1;
        button.innerHTML = `<i class="far fa-heart"></i> ${voteCount}`;
    }
};

import { loadSteemPosts, loadSinglePost, votePost } from './posts/post-service.js';
import { showVotersModal } from './modals/voters-modal.js';
import { showCommentsModal } from './modals/comments-modal.js';
import { loadUserProfile } from './profile/profile-service.js';
import { updateSidebar } from './sidebar/sidebar-service.js';

export {
    loadSteemPosts,
    loadSinglePost,
    votePost,
    showVotersModal,
    showCommentsModal,
    loadUserProfile,
    updateSidebar
};
