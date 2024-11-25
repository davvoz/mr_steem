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

export async function loadExploreContent() {
    try {
        const trending = await steem.api.getDiscussionsByTrendingAsync({ limit: 20 });
        displayPosts(trending, 'explore-container');
    } catch (error) {
        console.error('Error loading explore content:', error);
        document.getElementById('explore-container').innerHTML =
            '<div class="error-message">Failed to load explore content</div>';
    }
}

async function displayPosts(posts, containerId = 'posts-container', append = false) {
    // Move this check inside the function
    if (!steemConnection.isConnected || !steemConnection.username) {
        console.log('No user connected, skipping suggestions');
        return; // Now the return is properly inside the function
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    let postsHTML = '';

    for (const post of posts) {
        const [authorAccount] = await steem.api.getAccountsAsync([post.author]);
        const postImage = extractImageFromContent(post);
        const authorImage = authorAccount ? extractProfileImage(authorAccount) : null;
        const avatarUrl = authorImage || `https://steemitimages.com/u/${post.author}/avatar/small`;

        const postHTML = `
            <article class="post" onclick="location.hash='#/post/${post.author}/${post.permlink}'">
                <header class="post-header" onclick="event.stopPropagation()">
                    <div class="author-avatar-container">
                        <img src="${avatarUrl}" 
                             alt="${post.author}" 
                             class="author-avatar"
                             onerror="this.src='https://steemitimages.com/u/${post.author}/avatar/small'">
                    </div>
                    <a href="#/profile/${post.author}" class="author-name">@${post.author}</a>
                </header>
                <div class="post-content">
                    ${postImage ? `
                        <div class="post-image-container">
                            <img src="${postImage}" 
                                 alt="Post content"
                                 onerror="this.parentElement.style.display='none'">
                        </div>
                    ` : ''}
                    <div class="post-title">
                        <h3>${post.title}</h3>
                    </div>
                </div>
                <footer class="post-actions" onclick="event.stopPropagation()">
                    <span class="post-stat">${parseInt(post.active_votes.length)} likes</span>
                    <span class="post-stat">${parseInt(post.children)} comments</span>
                </footer>
            </article>
        `;

        postsHTML += postHTML;
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
