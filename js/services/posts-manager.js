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
                `https://images.hive.blog/u/${post.author}/avatar` || 
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

async function preloadAvatars(accounts) {
    for (const account of accounts) {
        if (!avatarCache.has(account.name)) {
            const profileImage = extractProfileImage(account) ||
                `https://steemitimages.com/u/${account.name}/avatar/small`;
            avatarCache.set(account.name, profileImage);
        }
    }
}

function resetProfileState(username) {
    profileLastPost = null;
    isLoadingProfile = false;
    hasMoreProfilePosts = true;

    // Reset post caches for the profile
    if (globalPostsCache.profile.has(username)) {
        globalPostsCache.profile.set(username, new Set());
    }

    // Remove any existing profile scroll handler
    if (window._profileScrollHandler) {
        window.removeEventListener('scroll', window._profileScrollHandler);
        window._profileScrollHandler = null;
    }

    // Clear existing content
    const postsGrid = document.getElementById('profile-posts-grid');
    const blogPosts = document.getElementById('profile-blog-posts');
    if (postsGrid) postsGrid.innerHTML = '';
    if (blogPosts) blogPosts.innerHTML = '';
}

function setupProfileTabs(username) {
    const tabs = document.querySelectorAll('.profile-tab');
    const contents = document.querySelectorAll('.profile-content > div');

    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab
            tab.classList.add('active');

            // Show corresponding content
            const contentId = `profile-${tab.dataset.tab}`;
            const content = document.getElementById(contentId);
            if (content) {
                content.classList.add('active');
            }

            // Load content if needed
            if (tab.dataset.tab === 'blog' && !content.hasChildNodes()) {
                await loadBlogPosts(username);
            }
        });
    });
}

async function loadBlogPosts(username) {
    const container = document.getElementById('profile-blog-posts');
    if (!container) return;

    try {
        showProfileLoadingIndicator();

        const posts = await steem.api.getDiscussionsByBlogAsync({
            tag: username,
            limit: 10
        });

        const postsHTML = await Promise.all(posts.map(async post => {
            const imageUrl = extractImageFromContent(post);
            const postDate = new Date(post.created).toLocaleString();
            const excerpt = post.body.replace(/!\[.*?\]\(.*?\)/g, '') // Remove image markdown
                                   .replace(/\[.*?\]\(.*?\)/g, '') // Remove links
                                   .replace(/[#*`]/g, '') // Remove markdown symbols
                                   .substring(0, 250);

            try {
                const metadata = JSON.parse(typeof post.json_metadata === 'string' ? 
                    post.json_metadata : '{}');
                const tags = metadata.tags || [];
                
                // Controlla se l'utente ha già votato il post
                const hasVoted = post.active_votes.some(vote => 
                    vote.voter === steemConnection.username
                );

                return `
                    <article class="blog-post">
                        <div class="blog-post-header">
                            ${imageUrl ? `
                                <div class="blog-post-image">
                                    <img src="${imageUrl}" alt="${post.title}" loading="lazy">
                                </div>
                            ` : ''}
                            <h2 class="blog-post-title">${post.title}</h2>
                        </div>
                        <div class="blog-post-content">
                            <div class="blog-post-meta">
                                <span class="blog-post-date">
                                    <i class="far fa-calendar"></i> ${postDate}
                                </span>
                                <span class="blog-post-stats">
                                    <button class="vote-button ${hasVoted ? 'voted' : ''}"
                                            onclick="event.stopPropagation(); window.handleVote('${post.author}', '${post.permlink}', this);"
                                            ${hasVoted ? 'disabled' : ''}>
                                        <i class="far fa-heart"></i> ${post.active_votes.length}
                                    </button>
                                    <span><i class="far fa-comment"></i> ${post.children}</span>
                                    <span><i class="fas fa-dollar-sign"></i> ${parseFloat(post.pending_payout_value).toFixed(2)}</span>
                                </span>
                            </div>
                            <p class="blog-post-excerpt">${excerpt}...</p>
                            <div class="blog-post-footer">
                                <div class="blog-post-tags">
                                    ${tags.slice(0, 5).map(tag => 
                                        `<span class="blog-tag">#${tag}</span>`
                                    ).join('')}
                                </div>
                                <a href="#/post/${post.author}/${post.permlink}" 
                                   class="read-more-btn">Read More</a>
                            </div>
                        </div>
                    </article>
                `;
            } catch (error) {
                console.warn('Failed to parse post metadata:', error);
                return '';
            }
        }));

        container.innerHTML = postsHTML.join('') || '<div class="no-posts">No blog posts found</div>';

        // Add CSS class for fade-in animation
        container.querySelectorAll('.blog-post').forEach((post, index) => {
            setTimeout(() => post.classList.add('visible'), index * 100);
        });

    } catch (error) {
        console.error('Failed to load blog posts:', error);
        container.innerHTML = '<div class="error-message">Failed to load blog posts</div>';
    } finally {
        hideProfileLoadingIndicator();
    }
}

async function loadMoreProfilePosts(username, append = true) {
    if (isLoadingProfile || !hasMoreProfilePosts) return;

    try {
        isLoadingProfile = true;
        showProfileLoadingIndicator();

        const query = {
            tag: username,
            limit: 20,
            start_author: profileLastPost?.author || undefined,
            start_permlink: profileLastPost?.permlink || undefined
        };

        const posts = await steem.api.getDiscussionsByBlogAsync(query);

        // Verify we have posts
        if (!posts || posts.length === 0) {
            hasMoreProfilePosts = false;
            return;
        }

        // Remove the first post if this is not the first load
        const postsToProcess = profileLastPost ? posts.slice(1) : posts;

        // If no posts after removing the first one, stop
        if (postsToProcess.length === 0) {
            hasMoreProfilePosts = false;
            return;
        }

        // Update the reference to the last post
        profileLastPost = posts[posts.length - 1];

        const postsGrid = document.getElementById('profile-posts-grid');
        if (!postsGrid) return;

        const postsHTML = await Promise.all(postsToProcess.map(async post => {
            let imageUrl = extractImageFromContent(post);
            if (!imageUrl) {
                const [authorAccount] = await steem.api.getAccountsAsync([post.author]);
                imageUrl = authorAccount ? extractProfileImage(authorAccount) : null;
            }
            return `
                <div class="profile-post" 
                     data-permlink="${post.permlink}" 
                     data-author="${post.author}"
                     onclick="window.location.hash='#/post/${post.author}/${post.permlink}'">
                    ${imageUrl
                        ? `<img src="${imageUrl}" alt="${post.title}" loading="lazy" onerror="this.src='https://steemitimages.com/u/${post.author}/avatar';">`
                        : '<div class="no-image">No Image</div>'
                    }
                </div>
            `;
        }));

        if (append) {
            postsGrid.insertAdjacentHTML('beforeend', postsHTML.join(''));
        } else {
            postsGrid.innerHTML = postsHTML.join('');
        }

    } catch (error) {
        console.error('Failed to load profile posts:', error);
        hasMoreProfilePosts = false;
    } finally {
        isLoadingProfile = false;
        hideProfileLoadingIndicator();
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
