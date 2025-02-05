import { extractProfileImage, extractImageFromContent } from './posts/post-utils.js';
import {  showLoadingIndicator, hideLoadingIndicator} from './ui/loading-indicators.js';
import { nodes } from '../utils/config.js';

const seenPosts = new Set(); 
const globalPostsCache = {
    home: new Map(),
    profile: new Map()
};


let lastPost = null;
let isLoading = false;
let hasMore = true;
let currentApiUrl = 0;

async function initSteemConnection() {
    while (currentApiUrl < nodes.length) {
        try {
            steem.api.setOptions({ url: nodes[currentApiUrl] });
            // Test the connection
            await steem.api.getDynamicGlobalPropertiesAsync();
            console.log('Connected to Steem API:', nodes[currentApiUrl]);
            return true;
        } catch (error) {
            console.warn(`Failed to connect to ${nodes[currentApiUrl]}, trying next...`);
            currentApiUrl++;
        }
    }
    throw new Error('Failed to connect to any Steem API endpoint');
}

export async function loadHomeFeed(append = false) {
    if (isLoading || !hasMore) return;
    
    try {
        isLoading = true;
        showLoadingIndicator();

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
        if (currentApiUrl < nodes.length) {
            console.log('Attempting to reconnect with different API endpoint...');
            await loadHomeFeed(append);
        } else {
            document.getElementById('posts-container').innerHTML += 
                '<div class="error-message">Failed to load posts. <button onclick="window.location.reload()">Retry</button></div>';
        }
    } finally {
        isLoading = false;
        hideLoadingIndicator();
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

export async function displayPosts(posts, containerId = 'posts-container', append = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Solo filtra per tag se NON stiamo visualizzando il feed following
    const currentTag = getCurrentTagFromHash();
    let filteredPosts = posts;
    
    if (currentTag && currentTag !== 'following') {
        filteredPosts = posts.filter(post => {
            try {
                const metadata = JSON.parse(post.json_metadata);
                return metadata.tags && metadata.tags.includes(currentTag);
            } catch (error) {
                console.warn('Failed to parse post metadata:', error);
                return false;
            }
        });
    }

    if (filteredPosts.length === 0) {
        if (currentTag !== 'following') {  // Non mostrare questo messaggio per il feed following
            container.innerHTML = `
                <div class="no-posts-message">
                    No posts found ${currentTag ? `with tag #${currentTag}` : ''}
                </div>`;
        }
        return;
    }

    let postsHTML = '';

    for (const post of filteredPosts) {
        try {
            const [authorAccount] = await steem.api.getAccountsAsync([post.author]);
            //se l'autore è udabeu sbattiamolo fuori
            if (post.author === 'udabeu') continue;
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
                `https://steemitimages.com/u/${post.author}/avatar`;

            // Ensure post title exists
            const safeTitle = post.title || 'Untitled';

            const postHTML = `
                <article class="post" data-permlink="${post.permlink}" data-author="${post.author}">
                    <header class="post-header">
                        <div class="author-avatar-container">
                            <img src="${avatarUrl}" 
                                 alt="${post.author}" 
                                 class="author-avatar"
                                 onerror="this.src='https://steemitimages.com/u/${post.author}/avatar'">
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

function getCurrentTagFromHash() {
    const match = window.location.hash.match(/#\/tag\/([^/]+)/);
    return match ? match[1] : null;
}

window.handleVote = async (author, permlink, button) => {
    //spinner
    //showLoadingIndicator();
    const success = await votePost(author, permlink);
    if (success) {
       // hideLoadingIndicator();
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
