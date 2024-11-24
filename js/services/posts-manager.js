import { steemConnection } from '../auth/login-manager.js';
import { avatarCache } from '../utils/avatar-cache.js';

// Initialize global state and caches
let lastPost = null;
let isLoading = false;
let hasMorePosts = true;
const seenPosts = new Set(); // Add this line

// Add global posts cache
const globalPostsCache = {
    home: new Map(),
    profile: new Map()
};

// Add scroll management variables
let scrollTimeout = null;
let isScrolling = false;
let loadingLock = false;

// Add this at the top with other state variables
const processedPostIds = new Set();

function extractProfileImage(account) {
    return  'https://steemitimages.com/u/' + account.name + '/avatar' 
}

export function extractImageFromContent(content) {
    if (!content) return null;

    // 1. Check JSON metadata first
    try {
        const metadata = typeof content.json_metadata === 'string'
            ? JSON.parse(content.json_metadata)
            : content.json_metadata;

        if (metadata?.image?.length > 0) {
            // Clean and validate the image URL
            const imageUrl = cleanImageUrl(metadata.image[0]);
            if (imageUrl) return imageUrl;
        }
    } catch (e) {
        console.warn('Failed to parse json_metadata:', e);
    }

    // 2. Check post body for images with improved regex patterns
    if (content.body) {
        // Array of patterns to match different markdown and HTML image formats
        const patterns = [
            /!\[([^\]]*)\]\((https?:\/\/[^)\s]+\.(jpg|jpeg|png|gif|webp)(\?[^)\s]*)?)\)/i,
            /<img[^>]+src=["'](https?:\/\/[^"']+\.(jpg|jpeg|png|gif|webp)(\?[^"']*)?)/i,
            /(https?:\/\/[^\s<>"]+?\.(jpg|jpeg|png|gif|webp)(\?[^\s<>"]*)?)/i,
            /(https?:\/\/[^\s<>"]+?steemitimages\.com\/[^\s<>"]+)/i,
            /(https?:\/\/[^\s<>"]+?ipfs\.io\/[^\s<>"]+)/i,
            /(https?:\/\/[^\s<>"]+?imgur\.com\/[^\s<>"]+)/i,
            /(https?:\/\/[^\s<>"]+?giphy\.com\/[^\s<>"]+)/i
        ];


        // Steemit image with size prefix

        for (const pattern of patterns) {
            const match = content.body.match(pattern);
            if (match) {
                // The actual URL will be in capturing group 1 or 2
                const imageUrl = cleanImageUrl(match[1] || match[2]);
                if (imageUrl) return imageUrl;
            }
        }
    }

    // 3. Fallback to author avatar
    return `https://steemitimages.com/u/${content.author}/avatar`;
}

function cleanImageUrl(url) {
    if (!url) return null;
    
    try {
        // Remove any markdown escaping
        url = url.replace(/\\+/g, '');
        
        // Ensure URL is properly encoded
        const parsed = new URL(url);
        
        // Add proxy for Steemit images if needed
        if (parsed.hostname.includes('steemitimages.com') && !url.includes('/0x0/')) {
            return `https://steemitimages.com/0x0/${url}`;
        }
        
        return url;
    } catch (e) {
        console.warn('Invalid image URL:', url);
        return null;
    }
}

let lastPostPermlink = null;
let lastPostAuthor = null;

export async function loadSteemPosts() {  // Add this missing function declaration
    if (isLoading || !hasMorePosts) return;

    try {
        isLoading = true;
        showLoadingIndicator();

        const query = {
            tag: 'photography',
            limit: 20,
            start_author: lastPostAuthor || undefined,
            start_permlink: lastPostPermlink || undefined
        };

        const posts = await steem.api.getDiscussionsByCreatedAsync(query);
        
        // Filtra i duplicati usando il nuovo sistema di cache
        const uniquePosts = posts.filter(post => {
            const postKey = `${post.author}-${post.permlink}`;
            if (seenPosts.has(postKey)) {
                return false;
            }
            seenPosts.add(postKey);
            return true;
        });

        // Se abbiamo un lastPost, rimuovi il primo elemento perché è duplicato
        if (lastPostPermlink && uniquePosts.length > 0) {
            uniquePosts.shift();
        }

        if (uniquePosts.length > 0) {
            // Aggiorna i riferimenti all'ultimo post
            const lastPost = uniquePosts[uniquePosts.length - 1];
            lastPostAuthor = lastPost.author;
            lastPostPermlink = lastPost.permlink;

            await displayPosts(uniquePosts, 'posts-container', true);
        } else {
            // No more posts to load
            hasMorePosts = false;
            window.removeEventListener('scroll', window._scrollHandler);
        }

    } catch (error) {
        console.error('Error loading posts:', error);
        // Show error message if this is the first load
        if (!lastPostPermlink) {
            const container = document.getElementById('posts-container');
            if (container) {
                container.innerHTML = `
                    <div class="error-container">
                        <p>Failed to load posts. Please try again later.</p>
                        <button onclick="window.location.reload()">Retry</button>
                    </div>
                `;
            }
        }
        hasMorePosts = false;
    } finally {
        isLoading = false;
        hideLoadingIndicator();
    }
}

function showLoadingIndicator() {
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

function hideLoadingIndicator() {
    const loader = document.querySelector('.loading-indicator');
    if (loader) loader.remove();
}

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

export async function loadStories() {
    if (!steemConnection.isConnected || !steemConnection.username) {
        console.log('No user connected, skipping stories load');
        return;
    }

    try {
        const following = await steem.api.getFollowingAsync(
            steemConnection.username,
            '',
            'blog',
            100 // Load more following accounts for better story coverage
        );

        const followingAccounts = await steem.api.getAccountsAsync(
            following.map(f => f.following)
        );

        await preloadAvatars(followingAccounts);

        const storiesContainer = document.getElementById('stories-container');
        if (!storiesContainer) return;

        // Prima creiamo il contenuto
        const storiesHtml = `
            <button class="story-scroll-button left">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="stories">
                ${followingAccounts.map(account => `
                    <div class="story" data-username="${account.name}">
                        <div class="story-avatar">
                            <div class="story-avatar-inner">
                                <img src="${avatarCache.get(account.name)}" 
                                     alt="${account.name}"
                                     style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                            </div>
                        </div>
                        <span>${account.name}</span>
                    </div>
                `).join('')}
            </div>
            <button class="story-scroll-button right">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        // Aggiorna il contenitore e set class
        storiesContainer.className = 'stories-container';
        storiesContainer.innerHTML = storiesHtml;

        // Setup scroll buttons
        setupStoryScroll(storiesContainer);

        // Add click handlers for stories dopo che il contenuto è stato aggiunto
        const storyElements = storiesContainer.querySelectorAll('.story');
        storyElements.forEach(storyElement => {
            const username = storyElement.dataset.username;
            if (username) {
                storyElement.addEventListener('click', () => viewStory(username));
            }
        });

    } catch (error) {
        console.error('Failed to load stories:', error);
        if (storiesContainer) {
            storiesContainer.innerHTML = '<div class="error-message">Failed to load stories</div>';
        }
    }
}

function setupStoryScroll(container) {
    const storiesDiv = container.querySelector('.stories');
    const leftBtn = container.querySelector('.story-scroll-button.left');
    const rightBtn = container.querySelector('.story-scroll-button.right');
    
    const updateButtonVisibility = () => {
        leftBtn.style.display = storiesDiv.scrollLeft > 0 ? 'flex' : 'none';
        rightBtn.style.display = 
            storiesDiv.scrollLeft < (storiesDiv.scrollWidth - storiesDiv.clientWidth - 10)
            ? 'flex' : 'none';
    };

    // Scroll amount for each click (show next set of stories)
    const scrollAmount = 300;

    leftBtn.addEventListener('click', () => {
        storiesDiv.scrollBy({
            left: -scrollAmount,
            behavior: 'smooth'
        });
    });

    rightBtn.addEventListener('click', () => {
        storiesDiv.scrollBy({
            left: scrollAmount,
            behavior: 'smooth'
        });
    });

    // Update button visibility on scroll and resize
    storiesDiv.addEventListener('scroll', updateButtonVisibility);
    window.addEventListener('resize', updateButtonVisibility);

    // Initial check
    updateButtonVisibility();
}

export async function viewStory(username) {
    try {
        const query = {
            tag: username,
            limit: 1,
            truncate_body: 1000
        };

        const posts = await steem.api.getDiscussionsByBlogAsync(query);

        if (posts && posts.length > 0) {
            const post = posts[0];
            let imageUrl = '';

            try {
                const metadata = typeof post.json_metadata === 'string'
                    ? JSON.parse(post.json_metadata)
                    : post.json_metadata;

                imageUrl = metadata?.image?.[0] || '';
            } catch (e) {
                console.warn('Failed to parse post metadata:', e);
            }

            const modal = document.createElement('div');
            modal.className = 'story-modal';
            modal.innerHTML = `
                <div class="story-content">
                    <div class="story-header">
                        <img src="${avatarCache.get(username)}" alt="${username}">
                        <span>@${username}</span>
                        <div class="story-timestamp">
                            ${new Date(post.created).toLocaleString()}
                        </div>
                        <button class="close-story">&times;</button>
                    </div>
                    <div class="story-body">
                        ${imageUrl ? `
                            <div class="story-image">
                                <img src="${imageUrl}" alt="Post image">
                            </div>
                        ` : ''}
                        <h3>${post.title}</h3>
                        <p>${post.body.substring(0, 280)}${post.body.length > 280 ? '...' : ''}</p>
                        <a href="#/post/${post.author}/${post.permlink}" class="view-full-post">
                            View Full Post
                        </a>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Add click handler for the view full post link
            modal.querySelector('.view-full-post').addEventListener('click', () => {
                modal.remove(); // Close the modal when navigating to full post
            });

            // Close on click outside or on close button
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('close-story')) {
                    modal.remove();
                }
            });

            // Close on escape key
            document.addEventListener('keydown', function closeOnEscape(e) {
                if (e.key === 'Escape') {
                    modal.remove();
                    document.removeEventListener('keydown', closeOnEscape);
                }
            });
        } else {
            throw new Error('No recent posts found');
        }
    } catch (error) {
        console.error('Failed to load user story:', error);
        const errorMessage = error.message === 'No recent posts found'
            ? 'This user has no recent posts to show.'
            : 'Failed to load story. Please try again later.';

        const errorModal = document.createElement('div');
        errorModal.className = 'story-modal error';
        errorModal.innerHTML = `
            <div class="story-content error">
                <h3>Oops!</h3>
                <p>${errorMessage}</p>
                <button onclick="this.closest('.story-modal').remove()">Close</button>
            </div>
        `;
        document.body.appendChild(errorModal);
    }
}

export async function createNewPost() {
    if (!steemConnection.isConnected || !steemConnection.username) {
        alert('Please connect to Steem first');
        return;
    }

    const title = prompt('Enter post title:');
    const description = prompt('Enter your post description:');
    const imageUrl = prompt('Enter image URL:');

    if (!title || !description) return;

    try {
        const permlink = 'instaclone-' + Date.now();
        const body = `
${description}

![Post Image](${imageUrl})

Posted via InstaClone
`;
        const operations = [
            ['comment', {
                parent_author: '',
                parent_permlink: 'instaclone',
                author: steemConnection.username,
                permlink: permlink,
                title: title,
                body: body,
                json_metadata: JSON.stringify({
                    tags: ['instaclone', 'photo', 'social'],
                    app: 'instaclone/1.0',
                    image: [imageUrl]
                })
            }]
        ];

        await submitPost(operations);
        alert('Posted successfully to Steem!');
        await loadSteemPosts();
    } catch (error) {
        console.error('Failed to post:', error);
        alert('Failed to post: ' + error.message);
    }
}

export async function loadSuggestions() {
    if (!steemConnection.isConnected || !steemConnection.username) {
        console.log('No user connected, skipping suggestions');
        return;
    }

    try {
        const trending = await steem.api.getDiscussionsByTrendingAsync({
            tag: 'photography',
            limit: 5 // Ridotto a 5 per la sidebar
        });

        const uniqueAuthors = [...new Set(trending.map(post => post.author))]
            .filter(author => author !== steemConnection.username)
            .slice(0, 5);

        const authorAccounts = await steem.api.getAccountsAsync(uniqueAuthors);
        await preloadAvatars(authorAccounts);

        const suggestionsContainer = document.getElementById('suggestions-container');
        if (!suggestionsContainer) return;

        suggestionsContainer.innerHTML = authorAccounts.map(account => `
            <div class="suggestion-item">
                <div class="suggestion-user">
                    <div class="suggestion-avatar">
                        <img src="${avatarCache.get(account.name)}" alt="${account.name}">
                    </div>
                    <div class="suggestion-info">
                        <div class="suggestion-username">@${account.name}</div>
                        <div class="suggestion-meta">
                            <span class="reputation">
                                Rep: ${Math.floor(steem.formatter.reputation(account.reputation))}
                            </span>
                        </div>
                    </div>
                </div>
                <button onclick="followUser('${account.name}')" class="follow-btn">
                    Follow
                </button>
            </div>
        `).join('');

    } catch (error) {
        console.error('Failed to load suggestions:', error);
        const suggestionsContainer = document.getElementById('suggestions-container');
        if (suggestionsContainer) {
            suggestionsContainer.innerHTML = '<div class="error-message">Failed to load suggestions</div>';
        }
    }
}

export async function loadExtendedSuggestions() {
    if (!steemConnection.isConnected || !steemConnection.username) {
        console.log('No user connected, skipping extended suggestions');
        return;
    }

    try {
        // Prima otteniamo i following dell'utente
        const following = await steem.api.getFollowingAsync(
            steemConnection.username,
            '',
            'blog',
            1000
        );

        // Per ogni following, otteniamo i loro following
        let allSuggestions = new Set();
        for (const follow of following) {
            const friendFollowing = await steem.api.getFollowingAsync(
                follow.following,
                '',
                'blog',
                100
            );

            friendFollowing.forEach(ff => {
                if (ff.following !== steemConnection.username &&
                    !following.some(f => f.following === ff.following)) {
                    allSuggestions.add(ff.following);
                }
            });
        }

        // Converti il Set in array e limita a 50 suggerimenti
        const suggestedUsers = [...allSuggestions].slice(0, 50);

        // Ottieni i dettagli degli account
        const accounts = await steem.api.getAccountsAsync(suggestedUsers);
        await preloadAvatars(accounts);

        const container = document.getElementById('suggestions-view');
        if (!container) return;

        container.innerHTML = `
            <h2>Suggested Users</h2>
            <div class="extended-suggestions">
                ${accounts.map(account => `
                    <div class="suggestion-item">
                        <div class="suggestion-user">
                            <div class="suggestion-avatar">
                                <img src="${avatarCache.get(account.name)}" alt="${account.name}">
                            </div>
                            <div class="suggestion-info">
                                <div class="suggestion-username">@${account.name}</div>
                                <div class="suggestion-meta">
                                    <span class="reputation">
                                        Rep: ${Math.floor(steem.formatter.reputation(account.reputation))}
                                    </span>
                                    <span class="dot">•</span>
                                    <span class="posts-count">
                                        ${account.post_count} posts
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button onclick="followUser('${account.name}')" class="follow-btn">
                            Follow
                        </button>
                    </div>
                `).join('')}
            </div>
        `;

    } catch (error) {
        console.error('Failed to load extended suggestions:', error);
        const container = document.getElementById('suggestions-view');
        if (container) {
            container.innerHTML = '<div class="error-message">Failed to load suggestions</div>';
        }
    }
}

export async function followUser(username) {
    if (!steemConnection.isConnected || !steemConnection.username) {
        alert('Please connect to Steem first');
        return;
    }

    try {
        const key = sessionStorage.getItem('steemPostingKey');
        if (!key) {
            throw new Error('Posting key required to follow users');
        }

        await steem.broadcast.customJsonAsync(
            key,
            [],
            [steemConnection.username],
            'follow',
            JSON.stringify(['follow', {
                follower: steemConnection.username,
                following: username,
                what: ['blog']
            }])
        );

        // Update UI
        const followBtn = document.querySelector(`button[onclick="followUser('${username}')"]`);
        if (followBtn) {
            followBtn.textContent = 'Following';
            followBtn.disabled = true;
        }

        // Show success popup
        showFollowPopup(username);

    } catch (error) {
        console.error('Failed to follow user:', error);
        alert('Failed to follow user: ' + error.message);
    }
}

function showFollowPopup(username) {
    const popup = document.createElement('div');
    popup.className = 'follow-popup';
    popup.innerHTML = `
        <div class="follow-popup-content">
            <i class="fas fa-check-circle"></i>
            <p>You are now following @${username}</p>
        </div>
    `;

    document.body.appendChild(popup);

    // Add active class after a small delay for animation
    requestAnimationFrame(() => popup.classList.add('active'));

    // Remove popup after 2 seconds
    setTimeout(() => {
        popup.classList.remove('active');
        setTimeout(() => popup.remove(), 300); // Remove after fade out animation
    }, 2000);
}

async function submitPost(operations) {
    const key = sessionStorage.getItem('steemPostingKey');
    if (!key) {
        throw new Error('Posting key required');
    }

    await steem.broadcast.sendAsync(
        { operations: operations, extensions: [] },
        { posting: key }
    );
}

async function displayPosts(posts, containerId = 'posts-container', append = false) {
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
                    <div class="post-body">
                        <h3>${post.title}</h3>
                        <p>${post.body.substring(0, 100)}...</p>
                    </div>
                </div>
                <footer class="post-actions" onclick="event.stopPropagation()">
                    <i class="far fa-heart" data-post-id="${post.id}"></i>
                    <i class="far fa-comment"></i>
                    <i class="far fa-paper-plane"></i>
                    <i class="far fa-bookmark"></i>
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

let profileLastPost = null;
let isLoadingProfile = false;
let hasMoreProfilePosts = true;

// Aggiungiamo una cache per tenere traccia dei post già caricati
const loadedPostsCache = new Map();

// Add this before loadUserProfile
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

export async function loadUserProfile(username) {
    resetProfileState(username);

    try {
        const [account] = await steem.api.getAccountsAsync([username]);
        if (!account) throw new Error('Account not found');

        const followCount = await steem.api.getFollowCountAsync(username);
        const profileImage = extractProfileImage(account);

        let isFollowing = false;
        if (steemConnection.isConnected && steemConnection.username) {
            const following = await steem.api.getFollowingAsync(
                steemConnection.username, 
                username, 
                'blog', 
                1
            );
            isFollowing = following.some(f => f.following === username);
        }

        const isOwnProfile = steemConnection.username === username;

        const profileView = document.getElementById('profile-view');
        if (!profileView) return;

        profileView.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar">
                    <img src="${profileImage}" alt="${username}">
                </div>
                <div class="profile-info">
                    <div class="profile-header-top">
                        <h2>@${username}</h2>
                        ${!isOwnProfile ? `
                            <button class="follow-button ${isFollowing ? 'following' : ''}" 
                                    onclick="window.followUser('${username}')"
                                    ${!steemConnection.isConnected ? 'disabled' : ''}>
                                ${isFollowing ? 'Following' : 'Follow'}
                            </button>
                        ` : ''}
                    </div>
                    <div class="profile-stats">
                        <span><strong>${account.post_count}</strong> posts</span>
                        <span><strong>${followCount.follower_count}</strong> followers</span>
                        <span><strong>${followCount.following_count}</strong> following</span>
                    </div>
                    <div class="profile-bio">
                        ${account.json_metadata ? JSON.parse(account.json_metadata)?.profile?.about || '' : ''}
                    </div>
                </div>
            </div>
            <div class="profile-tabs">
                <div class="profile-tab active" data-tab="posts">POSTS</div>
                <div class="profile-tab" data-tab="blog">BLOG</div>
            </div>
            <div class="profile-content">
                <div id="profile-posts" class="active">
                    <div class="posts-grid" id="profile-posts-grid"></div>
                </div>
                <div id="profile-blog">
                    <div class="posts" id="profile-blog-posts"></div>
                </div>
                <div class="profile-loading-indicator" style="display: none;">
                    <div class="spinner"></div>
                </div>
            </div>
        `;

        // Setup tab switching
        setupProfileTabs(username);

        // Setup initial tab content
        await loadMoreProfilePosts(username, false);

        window.followUser = followUser;
    } catch (error) {
        console.error('Failed to load profile:', error);
        document.getElementById('profile-view').innerHTML =
            '<div class="error-message">Failed to load profile</div>';
    }
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
                                    <span><i class="far fa-heart"></i> ${post.net_votes}</span>
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

export async function loadSinglePost(author, permlink) {
    try {
        const post = await steem.api.getContentAsync(author, permlink);
        if (!post || !post.author) {
            throw new Error('Post not found');
        }

        const [authorAccount] = await steem.api.getAccountsAsync([post.author]);
        const authorImage = authorAccount ? extractProfileImage(authorAccount) : null;
        const avatarUrl = authorImage || `https://steemitimages.com/u/${post.author}/avatar/small`;

        // Converti il markdown in HTML senza troncamento
        const htmlContent = marked.parse(post.body, {
            breaks: true,        // Converte i ritorni a capo in <br>
            sanitize: false,     // Permette HTML nel markdown
            gfm: true,           // Abilita GitHub Flavored Markdown
            headerIds: false     // Disabilita gli id automatici negli header
        });
        
        const postDate = new Date(post.created).toLocaleString();

        const postView = document.getElementById('post-view');
        if (!postView) return;

        postView.innerHTML = `
            <article class="full-post">
                <header class="post-header">
                    <div class="author-info">
                        <img src="${avatarUrl}" alt="${post.author}" class="author-avatar">
                        <div class="author-details">
                            <a href="#/profile/${post.author}" class="author-name">@${post.author}</a>
                            <span class="post-date">${postDate}</span>
                        </div>
                    </div>
                </header>
                <div class="post-content">
                    <h1 class="post-title">${post.title}</h1>
                    
                    <div class="post-body markdown-content">
                        ${htmlContent}
                    </div>
                </div>
                <footer class="post-footer">
                    <div class="post-stats">
                        <span class="votes-container">
                            <i class="far fa-heart"></i> 
                            <span class="net_votes clickable" data-post-author="${post.author}" data-post-permlink="${post.permlink}">
                                ${post.net_votes} likes
                            </span>
                        </span>
                        <span class="comments-container">
                            <i class="far fa-comment"></i> 
                            <span class="comments-count clickable" data-post-author="${post.author}" data-post-permlink="${post.permlink}">
                                ${post.children} comments
                            </span>
                        </span>
                        <span><i class="fas fa-dollar-sign"></i> ${parseFloat(post.pending_payout_value).toFixed(2)} payout</span>
                    </div>
                    <div class="post-tags">
                        ${post.json_metadata ? JSON.parse(post.json_metadata)?.tags?.map(tag => 
                            `<a href="#/tag/${tag}" class="tag">#${tag}</a>`
                        ).join(' ') || '' : ''}
                    </div>
                </footer>
            </article>
        `;
        // Add event listener after the content is in the DOM
        const votesElement = postView.querySelector('.net_votes');
        const commentsElement = postView.querySelector('.comments-count');
        
        if (votesElement) {
            votesElement.addEventListener('click', async () => {
                const author = votesElement.getAttribute('data-post-author');
                const permlink = votesElement.getAttribute('data-post-permlink');
                try {
                    const votes = await steem.api.getActiveVotesAsync(author, permlink);
                    showVotersModal(votes);
                } catch (error) {
                    console.error('Failed to load voters:', error);
                    alert('Failed to load voters: ' + error.message);
                }
            });
        }

        if (commentsElement) {
            commentsElement.addEventListener('click', async () => {
                const author = commentsElement.getAttribute('data-post-author');
                const permlink = commentsElement.getAttribute('data-post-permlink');
                try {
                    const replies = await steem.api.getContentRepliesAsync(author, permlink);
                    showCommentsModal(replies);
                } catch (error) {
                    console.error('Failed to load comments:', error);
                    alert('Failed to load comments: ' + error.message);
                }
            });
        }

    } catch (error) {
        console.error('Failed to load post:', error);
        document.getElementById('post-view').innerHTML = `
            <div class="error-message">Failed to load post</div>
        `;
    }
}

function showVotersModal(votes) {
    const modal = document.createElement('div');
    modal.className = 'modal-base voters-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Likes ${votes.length > 0 ? `(${votes.length})` : ''}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${votes.length > 0 ? 
                    votes.map(vote => `
                        <div class="voter-item">
                            <div class="voter-info">
                                <img src="https://steemitimages.com/u/${vote.voter}/avatar" 
                                     alt="@${vote.voter}"
                                     class="voter-avatar"
                                     onerror="this.src='https://steemitimages.com/u/${vote.voter}/avatar/small'">
                                <a href="#/profile/${vote.voter}" class="voter-name" onclick="this.closest('.modal-base').remove()">@${vote.voter}</a>
                            </div>
                            <span class="vote-weight">${(vote.percent / 100).toFixed(0)}%</span>
                        </div>
                    `).join('') :
                    '<div class="no-items">No likes yet</div>'
                }
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));

    setupModalClosing(modal);
}

function showCommentsModal(comments) {
    const modal = document.createElement('div');
    modal.className = 'modal-base comments-modal';
    
    const setupImageExpansion = (container, img, imageUrl) => {
        let overlay = null;
        
        const expandImage = (event) => {
            event.preventDefault();
            
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'comment-image-overlay';
                document.body.appendChild(overlay);
            }
            
            const expandedImg = img.cloneNode(true);
            expandedImg.classList.add('expanded');
            expandedImg.classList.remove('comment-image-thumbnail');
            
            overlay.innerHTML = '';
            overlay.appendChild(expandedImg);
            overlay.classList.add('active');
            
            const closeOverlay = () => {
                overlay.classList.remove('active');
                setTimeout(() => overlay.innerHTML = '', 200);
            };
            
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target === expandedImg) {
                    closeOverlay();
                }
            });
            
            document.addEventListener('keydown', function closeOnEsc(e) {
                if (e.key === 'Escape') {
                    closeOverlay();
                    document.removeEventListener('keydown', closeOnEsc);
                }
            });
        };

        // Create title bar with the expand button
        const titleBar = document.createElement('div');
        titleBar.className = 'comment-image-title';
        titleBar.innerHTML = `
            <span>Image</span>
            <button class="comment-image-expand" title="Expand image">
                <i class="fas fa-expand"></i>
            </button>
        `;
        
        container.appendChild(titleBar);
        
        // Add click handlers
        img.addEventListener('click', expandImage);
        titleBar.querySelector('.comment-image-expand').addEventListener('click', expandImage);
    };

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Comments ${comments.length > 0 ? `(${comments.length})` : ''}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${comments.length > 0 ? 
                    comments.map(comment => {
                        const imageUrl = extractImageFromContent(comment);
                        const parsedBody = marked.parse(comment.body, {
                            breaks: true,
                            sanitize: false,
                            gfm: true,
                            // Add these options to better handle long URLs
                            smartypants: true,
                            breaks: true
                        }).replace(
                            // Replace long image URLs with a more compact display
                            /!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g, 
                            '<div class="comment-image-container">$&</div>'
                        );

                        return `
                            <div class="comment-item">
                                <img src="https://steemitimages.com/u/${comment.author}/avatar" 
                                     alt="@${comment.author}"
                                     class="comment-avatar"
                                     onerror="this.src='https://steemitimages.com/u/${comment.author}/avatar/small'">
                                <div class="comment-content">
                                    <a href="#/profile/${comment.author}" class="comment-author" onclick="this.closest('.modal-base').remove()">@${comment.author}</a>
                                    ${imageUrl ? `
                                        <div class="comment-image-container">
                                            <img src="${imageUrl}" 
                                                 alt="Comment image" 
                                                 class="comment-image comment-image-thumbnail">
                                        </div>
                                    ` : ''}
                                    <div class="comment-text">${parsedBody}</div>
                                    <div class="comment-meta">
                                        ${new Date(comment.created).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('') :
                    '<div class="no-items">No comments yet</div>'
                }
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => {
        modal.classList.add('active');
        // Setup image expansion for all comment images
        modal.querySelectorAll('.comment-image-container').forEach(container => {
            const img = container.querySelector('.comment-image');
            const imageUrl = img.getAttribute('src');
            setupImageExpansion(container, img, imageUrl);
        });
    });

    setupModalClosing(modal);
}

function setupModalClosing(modal) {
    const close = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 200);
    };

    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });
    
    document.addEventListener('keydown', function escapeHandler(e) {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', escapeHandler);
        }
    });
}

export function setupInfiniteScroll() {
    // Remove existing scroll listener if any
    window.removeEventListener('scroll', window._scrollHandler);
    
    // Create new optimized scroll handler
    window._scrollHandler = throttle(() => {
        if (loadingLock) return;
        
        const scrollPosition = window.innerHeight + window.pageYOffset;
        const threshold = document.documentElement.scrollHeight - 1000;
        
        if (scrollPosition >= threshold) {
            requestAnimationFrame(async () => {
                try {
                    loadingLock = true;
                    showLoadingIndicator();
                    await loadSteemPosts();
                } catch (error) {
                    console.error('Error loading more posts:', error);
                } finally {
                    loadingLock = false;
                    hideLoadingIndicator();
                }
            });
        }
    }, 150);

    window.addEventListener('scroll', window._scrollHandler, { passive: true });
}

function setupProfileInfiniteScroll(username) {
    window.removeEventListener('scroll', window._profileScrollHandler);
    
    let isLoadingMore = false;
    let lastScrollPos = 0;
    const scrollThreshold = 1000;
    
    window._profileScrollHandler = () => {
        // Verifica che siamo ancora nella vista del profilo
        const profileView = document.getElementById('profile-view');
        if (!profileView || profileView.style.display === 'none') return;

        // Verifica che siamo nel profilo corretto
        const currentProfileUsername = profileView.querySelector('.profile-header h2')?.textContent?.slice(1);
        if (currentProfileUsername !== username) return;

        // Previeni multiple chiamate durante lo scroll
        if (isLoadingMore) return;
        
        const currentScrollPos = window.scrollY;
        const scrollingDown = currentScrollPos > lastScrollPos;
        lastScrollPos = currentScrollPos;
        
        // Procedi solo se stiamo scrollando verso il basso
        if (!scrollingDown) return;

        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollHeight - scrollTop - clientHeight < scrollThreshold) {
            isLoadingMore = true;
            
            Promise.resolve().then(async () => {
                try {
                    showProfileLoadingIndicator();
                    await loadMoreProfilePosts(username, true);
                } catch (error) {
                    console.error('Error loading more profile posts:', error);
                } finally {
                    hideProfileLoadingIndicator();
                    // Aggiungi un piccolo delay prima di permettere altro caricamento
                    setTimeout(() => {
                        isLoadingMore = false;
                    }, 1000);
                }
            });
        }
    };

    window.addEventListener('scroll', window._profileScrollHandler, { passive: true });
}

function showProfileLoadingIndicator() {
    const indicator = document.querySelector('.profile-loading-indicator');
    if (indicator) indicator.style.display = 'block';
}

function hideProfileLoadingIndicator() {
    const indicator = document.querySelector('.profile-loading-indicator');
    if (indicator) indicator.style.display = 'none';
}

// Replace debounce with more efficient throttle for scroll events
function throttle(func, limit) {
    let inThrottle = false;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            requestAnimationFrame(() => {
                inThrottle = false;
            });
        }
    };
}

// Cleanup function to prevent memory leaks
export function cleanupInfiniteScroll() {
    if (window._scrollHandler) {
        window.removeEventListener('scroll', window._scrollHandler);
        window._scrollHandler = null;
    }
    resetPostsState();
}


// Modifica la funzione resetPostsState per includere la pulizia della cache
export function resetPostsState() {
    lastPostPermlink = null;
    lastPostAuthor = null;
    isLoading = false;
    seenPosts.clear(); // Pulisci la cache quando si resetta lo stato
    hasMorePosts = true;
    processedPostIds.clear(); // Clear the processed posts cache
}

export function updateSidebar() {
    const userProfile = document.getElementById('user-profile');
    const loginSection = document.getElementById('login-section');

    if (!userProfile) return;

    if (steemConnection.isConnected && steemConnection.username) {
        // Nascondi sezione login
        if (loginSection) {
            loginSection.style.display = 'none';
        }

        const profileImage = avatarCache.get(steemConnection.username) ||
            `https://steemitimages.com/u/${steemConnection.username}/avatar`;

        userProfile.innerHTML = `
            <div class="sidebar-profile">
                <img src="${profileImage}" alt="${steemConnection.username}" 
                     style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover;">
                <div class="sidebar-profile-info">
                    <h4>@${steemConnection.username}</h4>
                </div>
            </div>
        `;
        userProfile.style.display = 'block';
    } else {
        // Mostra sezione login
        userProfile.innerHTML = `
            <div class="login-section" id="login-section">
                <h4>Connect to Steem</h4>
                <p>Login to follow creators, like photos, and view your profile.</p>
                <button id="connect-steem" class="connect-button">Connect to Steem</button>
            </div>
        `;

        const connectButton = document.getElementById('connect-steem');
        if (connectButton) {
            connectButton.addEventListener('click', () => {
                const { showLoginModal } = require('../auth/login-manager.js');
                showLoginModal();
            });
        }
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
