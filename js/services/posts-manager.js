import { steemConnection } from '../auth/login-manager.js';
import { avatarCache } from '../utils/avatar-cache.js';

let lastPost = null;
let isLoading = false;
let hasMorePosts = true;

// Add this helper function at the top of the file
function extractProfileImage(account) {
    try {
        // Try posting_json_metadata first (newer version)
        let metadata = account.posting_json_metadata;
        if (typeof metadata === 'string') {
            metadata = JSON.parse(metadata);
            if (metadata?.profile?.profile_image) {
                return metadata.profile.profile_image;
            }
        }

        // Fallback to json_metadata
        metadata = account.json_metadata;
        if (typeof metadata === 'string') {
            metadata = JSON.parse(metadata);
            if (metadata?.profile?.profile_image) {
                return metadata.profile.profile_image;
            }
        }
    } catch (e) {
        console.warn(`Failed to parse metadata for ${account.name}:`, e);
    }
    return null;
}

export async function loadSteemPosts(append = false) {
    if (isLoading || !hasMorePosts) return;
    
    try {
        isLoading = true;
        showLoadingIndicator();
        
        const query = {
            limit: 20,
            tag: '',
            truncate_body: 1000 // Optional: limit post body size for better performance
        };
        
        if (lastPost) {
            query.start_author = lastPost.author;
            query.start_permlink = lastPost.permlink;
        }

        const posts = await steem.api.getDiscussionsByCreatedAsync(query);
        
        if (posts.length < query.limit) {
            hasMorePosts = false;
        }
        
        if (posts.length > 0) {
            lastPost = posts[posts.length - 1];
        }

        displayPosts(posts, 'posts-container', append);
        
    } catch (error) {
        console.error('Error loading posts:', error);
        document.getElementById('posts-container').innerHTML += 
            '<div class="error-message">Failed to load more posts</div>';
    } finally {
        isLoading = false;
        hideLoadingIndicator();
    }
}

function showLoadingIndicator() {
    const loader = document.createElement('div');
    loader.className = 'loading-indicator';
    loader.innerHTML = '<div class="spinner"></div>';
    document.getElementById('posts-container').appendChild(loader);
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
            10
        );
        
        const followingAccounts = await steem.api.getAccountsAsync(
            following.map(f => f.following)
        );
        
        await preloadAvatars(followingAccounts);
        
        const storiesContainer = document.getElementById('stories-container');
        if (!storiesContainer) return;

        storiesContainer.innerHTML = followingAccounts.map(account => `
            <div class="story">
                <div class="story-avatar">
                    <div class="story-avatar-inner">
                        <img src="${avatarCache.get(account.name)}" 
                             style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                    </div>
                </div>
                <span>${account.name}</span>
            </div>
        `).join('');

        // Add click handlers after creating the stories
        storiesContainer.querySelectorAll('.story').forEach((storyElement, index) => {
            storyElement.addEventListener('click', () => viewStory(followingAccounts[index].name));
        });
    } catch (error) {
        console.error('Failed to load stories:', error);
        const storiesContainer = document.getElementById('stories-container');
        if (storiesContainer) {
            storiesContainer.innerHTML = '<div class="error-message">Failed to load stories</div>';
        }
    }
}

export async function viewStory(username) {
    try {
        // Use a more reliable method to fetch recent posts
        const query = {
            tag: username,
            limit: 1,
            truncate_body: 1000 // Limit body size for better performance
        };

        const posts = await steem.api.getDiscussionsByBlogAsync(query);
        
        if (posts && posts.length > 0) {
            const post = posts[0];
            let imageUrl = '';

            // Try to extract image from post
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
                        <a href="https://steemit.com${post.url}" target="_blank" class="view-full-post">
                            View Full Post
                        </a>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
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
        // Get trending authors in the photography tag
        const trending = await steem.api.getDiscussionsByTrendingAsync({ 
            tag: 'photography', 
            limit: 10 
        });
        
        // Filter unique authors and remove current user
        const uniqueAuthors = [...new Set(trending.map(post => post.author))]
            .filter(author => author !== steemConnection.username)
            .slice(0, 5);

        // Get full account info for these authors
        const authorAccounts = await steem.api.getAccountsAsync(uniqueAuthors);
        
        // Preload avatars for suggestions
        await preloadAvatars(authorAccounts);

        const suggestionsContainer = document.getElementById('suggestions-container');
        if (!suggestionsContainer) {
            console.error('Suggestions container not found');
            return;
        }

        suggestionsContainer.innerHTML = `
            <div class="suggestions-header">
                <h4>Suggestions For You</h4>
                <a href="#/suggestions" class="see-all">See All</a>
            </div>
            ${authorAccounts.map(account => `
                <div class="suggestion-item">
                    <div class="suggestion-user">
                        <div class="suggestion-avatar">
                            <img src="${avatarCache.get(account.name)}" 
                                 alt="${account.name}">
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
        `;
        
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

// Add follow functionality
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

    } catch (error) {
        console.error('Failed to follow user:', error);
        alert('Failed to follow user: ' + error.message);
    }
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

// Update the displayPosts function post header section
function displayPosts(posts, containerId = 'posts-container', append = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const postsHTML = posts.map(post => {
        let imageUrl;
        try {
            const postMetadata = typeof post.json_metadata === 'string'     
                ? JSON.parse(post.json_metadata)
                : post.json_metadata;
            imageUrl = postMetadata?.image?.[0] || '';
        } catch (e) {
            console.warn('Failed to parse post metadata:', e);
        }

        const truncatedBody = post.body.length > 150 
            ? `${post.body.substring(0, 150)}...` 
            : post.body;

        // Use a default avatar URL if none is cached
        const defaultAvatarUrl = `https://images.hive.blog/u/${post.author}/avatar/small`;
        const avatarUrl = avatarCache.has(post.author) 
            ? avatarCache.get(post.author) 
            : defaultAvatarUrl;

        return `
            <article class="post">
                <header class="post-header">
                    <div class="author-avatar-container">
                        <img src="${avatarUrl}" 
                             alt="${post.author}" 
                             class="author-avatar"
                             onerror="if (this.src !== '${defaultAvatarUrl}') this.src='${defaultAvatarUrl}';">
                    </div>
                    <a href="#/profile/${post.author}" class="author-name">@${post.author}</a>
                </header>
                <div class="post-content">
                    ${imageUrl ? `
                        <div class="post-image-container">
                            <img src="${imageUrl}" 
                                 alt="Post content" 
                                 onerror="this.parentElement.style.display='none';">
                        </div>
                    ` : ''}
                    ${post.title ? `<h3 class="post-title">${post.title}</h3>` : ''}
                </div>
                <div class="post-body">
                    ${truncatedBody}
                </div>
                <footer class="post-actions">
                    <i class="far fa-heart" data-post-id="${post.id}"></i>
                    <i class="far fa-comment"></i>
                    <i class="far fa-paper-plane"></i>
                    <i class="far fa-bookmark"></i>
                </footer>
            </article>
        `;
    }).join('');

    if (append) {
        container.insertAdjacentHTML('beforeend', postsHTML);
    } else {
        container.innerHTML = postsHTML;
    }
}

function displayStories(stories) {
    const container = document.getElementById('stories-container');
    if (!container) return;

    container.innerHTML = stories.map(story => `
        <div class="story">
            <div class="story-avatar">
                <img src="https://steemitimages.com/u/${story.author}/avatar" alt="${story.author}">
            </div>
            <span>${story.author}</span>
        </div>
    `).join('');
}

// Update the preloadAvatars function
async function preloadAvatars(accounts) {
    for (const account of accounts) {
        if (!avatarCache.has(account.name)) {
            const profileImage = extractProfileImage(account) || 
                               `https://steemitimages.com/u/${account.name}/avatar/small`;
            avatarCache.set(account.name, profileImage);
        }
    }
}

export async function loadUserProfile(username) {

    try {
        const [account] = await steem.api.getAccountsAsync([username]);
        if (!account) throw new Error('Account not found');

        const userPosts = await steem.api.getDiscussionsByBlogAsync({
            tag: username,
            limit: 10
        });

        const followCount = await steem.api.getFollowCountAsync(username);

        // Parse metadata with error handling
        let metadata = account.json_metadata;
       
        const profileView = document.getElementById('profile-view');
        if (!profileView) return;
        try {
            if (typeof metadata === 'string') {
                metadata = JSON.parse(metadata);
            }
            if (!metadata.profile?.profile_image) {
                metadata = JSON.parse(account.posting_json_metadata || '{}');
            }
        } catch (error) {
            console.warn(`Failed to parse metadata for ${username}:`, error);
            metadata = {};
        }

        avatarCache.set(username, metadata.profile?.profile_image || avatarCache.getDefaultAvatar());

        profileView.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar">
                    <img src="${avatarCache.get(username) || 'https://steemitimages.com/u/' + username + '/avatar'}" alt="${username}">
                </div>
                <div class="profile-info">
                    <h2>@${username}</h2>
                    <div class="profile-stats">
                        <span><strong>${account.post_count}</strong> posts</span>
                        <span><strong>${followCount.follower_count}</strong> followers</span>
                        <span><strong>${followCount.following_count}</strong> following</span>
                    </div>
                    <div class="profile-bio">
                        ${metadata.profile?.about || ''}
                    </div>
                </div>
            </div>
            <div class="profile-posts">
                <h3>Posts</h3>
                <div class="posts-grid">
                    ${userPosts.map(post => {
                        let imageUrl = '';
                        try {
                            const postMetadata = typeof post.json_metadata === 'string'
                                ? JSON.parse(post.json_metadata)
                                : post.json_metadata;
                            imageUrl = postMetadata?.image?.[0] || '';
                        } catch (e) {
                            console.warn('Failed to parse post metadata:', e);
                        }
                        return `
                            <div class="profile-post">
                                ${imageUrl 
                                    ? `<img src="${imageUrl}" alt="${post.title}">`
                                    : '<div class="no-image">No Image</div>'
                                }
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

    } catch (error) {
        console.error('Failed to load profile:', error);
        document.getElementById('profile-view').innerHTML = 
            '<div class="error-message">Failed to load profile</div>';
    }
}

export function setupInfiniteScroll() {
    const handleScroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        
        // If we're near bottom (100px threshold)
        if (scrollHeight - scrollTop - clientHeight < 100) {
            loadSteemPosts(true); // true for append mode
        }
    };

    // Throttle scroll events
    let timeout;
    window.addEventListener('scroll', () => {
        if (timeout) return;
        timeout = setTimeout(() => {
            handleScroll();
            timeout = null;
        }, 100);
    });
}

export function updateSidebar() {
    const userProfile = document.getElementById('user-profile');
    if (!userProfile) return;

    if (steemConnection.isConnected) {
        const profileImage = avatarCache.get(steemConnection.username) || 
                           `https://steemitimages.com/u/${steemConnection.username}/avatar`;
        
        userProfile.innerHTML = `
            <div class="sidebar-profile">
                <img src="${profileImage}" alt="${steemConnection.username}" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover;">
                <div class="sidebar-profile-info">
                    <h4>@${steemConnection.username}</h4>
                </div>
            </div>
        `;
    } else {
        // Show login section
        userProfile.innerHTML = `
            <div class="login-section" id="login-section">
                <h4>Connect to Steem</h4>
                <p>Login to follow creators, like photos, and view your profile.</p>
                <button id="connect-steem" class="connect-button">Connect to Steem</button>
            </div>
        `;
        
        // Riattacca l'event listener per il login
        const connectButton = document.getElementById('connect-steem');
        if (connectButton) {
            connectButton.addEventListener('click', () => showLoginModal());
        }
    }
}