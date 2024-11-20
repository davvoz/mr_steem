import { steemConnection } from '../auth/login-manager.js';
import { avatarCache } from '../utils/avatar-cache.js';

let lastPost = null;
let isLoading = false;
let hasMorePosts = true;

function extractProfileImage(account) {
    return  'https://steemitimages.com/u/' + account.name + '/avatar' 
}

function extractImageFromContent(content) {
    if (!content) return null;

    // 1. Check JSON metadata first
    try {
        const metadata = typeof content.json_metadata === 'string'
            ? JSON.parse(content.json_metadata)
            : content.json_metadata;

        if (metadata?.image?.length > 0) {
            const imageUrl = metadata.image[0];
            if (typeof imageUrl === 'string' && imageUrl.match(/^https?:\/\/.+/i)) {
                return imageUrl;
            }
        }
    } catch (e) {
        console.warn('Failed to parse json_metadata:', e);
    }

    // 2. Check posting_json_metadata
    try {
        const metadata = typeof content.posting_json_metadata === 'string'
            ? JSON.parse(content.posting_json_metadata)
            : content.posting_json_metadata;

        if (metadata?.image?.length > 0) {
            const imageUrl = metadata.image[0];
            if (typeof imageUrl === 'string' && imageUrl.match(/^https?:\/\/.+/i)) {
                return imageUrl;
            }
        }
    } catch (e) {
        console.warn('Failed to parse posting_json_metadata:', e);
    }

    // 3. Check post body for images and GIFs
    if (content.body) {
        // Array of patterns to match different image formats
        const patterns = [
            // Markdown image with any image extension
            /!\[([^\]]*)\]\((https?:\/\/[^)\s]+\.(jpg|jpeg|png|gif|webp)(\?[^)\s]*)?)\)/i,
            
            // HTML img tag
            /<img[^>]+src=["'](https?:\/\/[^"']+\.(jpg|jpeg|png|gif|webp)(\?[^"']*)?)/i,
            
            // Direct image URLs
            /(https?:\/\/[^\s<>"]+?\.(jpg|jpeg|png|gif|webp)(\?[^\s<>"]*)?)/i,
            
            // Steemit.com image URLs
            /(https?:\/\/[^\s<>"]+?steemitimages\.com\/[^\s<>"]+)/i,
            
            // IPFS gateway URLs
            /(https?:\/\/[^\s<>"]+?ipfs\.io\/[^\s<>"]+)/i,
            
            // Additional common image hosting services
            /(https?:\/\/[^\s<>"]+?imgur\.com\/[^\s<>"]+)/i,
            /(https?:\/\/[^\s<>"]+?giphy\.com\/[^\s<>"]+)/i
        ];

        for (const pattern of patterns) {
            const matches = content.body.match(pattern);
            if (matches) {
                // Get the URL from the match
                const url = matches[1] || matches[0];
                // Clean up the URL (remove markdown or HTML artifacts)
                const cleanUrl = url.replace(/['"()]|!?\[[^\]]*\]/g, '');
                return cleanUrl;
            }
        }
    }

    // 4. Fallback to author avatar
    return `https://steemitimages.com/u/${content.author}/avatar`;
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
            100 // Load more following accounts for better story coverage
        );

        const followingAccounts = await steem.api.getAccountsAsync(
            following.map(f => f.following)
        );

        await preloadAvatars(followingAccounts);

        const storiesContainer = document.getElementById('stories-container');
        if (!storiesContainer) return;

        // Wrap the stories content
        storiesContainer.className = 'stories-container';
        storiesContainer.innerHTML = `
            <button class="story-scroll-button left">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="stories">
                ${followingAccounts.map(account => `
                    <div class="story">
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

        // Set up scroll buttons
        setupStoryScroll(storiesContainer);

        // Add click handlers for stories
        storiesContainer.querySelectorAll('.story').forEach((storyElement, index) => {
            storyElement.addEventListener('click', () => viewStory(followingAccounts[index].name));
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

async function displayPosts(posts, containerId = 'posts-container', append = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let postsHTML = '';

    for (const post of posts) {
        // Recupera l'account dell'autore
        const [authorAccount] = await steem.api.getAccountsAsync([post.author]);

        // Usa extractImageFromContent sia per il post che per l'autore
        const postImage = extractImageFromContent(post);
        const authorImage = authorAccount ? extractProfileImage(authorAccount) : null;
        console.log('Post image:', postImage);
        console.log('Author image:', authorImage);

        const avatarUrl = authorImage || `https://steemitimages.com/u/${post.author}/avatar/small`;

        const postHTML = `
            <article class="post">
                <header class="post-header">
                    <div class="author-avatar-container">
                        <img src="${avatarUrl}" 
                             alt="${post.author}" 
                             class="author-avatar"
                             onerror="this.src='https://steemitimages.com/u/${post.author}/avatar/small'">
                    </div>
                    <a href="#/profile/${post.author}" class="author-name">@${post.author}</a>
                </header>
                ${postImage ? `
                    <div class="post-content">
                        <div class="post-image-container">
                            <img src="${postImage}" 
                                 alt="Post content"
                                 onerror="this.parentElement.style.display='none'">
                        </div>
                    </div>
                ` : ''}
                <div class="post-body">
                    <h3>${post.title}</h3>
                    <p>${post.body.substring(0, 100)}...</p> <!-- Show snippet of text -->
                </div>
                <footer class="post-actions">
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

export async function loadUserProfile(username) {
    // Reset dello stato per il nuovo profilo
    profileLastPost = null;
    isLoadingProfile = false;
    hasMoreProfilePosts = true;

    try {
        const [account] = await steem.api.getAccountsAsync([username]);
        if (!account) throw new Error('Account not found');

        const followCount = await steem.api.getFollowCountAsync(username);
        const profileImage = extractProfileImage(account);

        const profileView = document.getElementById('profile-view');
        if (!profileView) return;

        // Prima costruiamo e inseriamo la struttura base del profilo
        profileView.innerHTML = `
            <div class="profile-header">
                <div class="profile-avatar">
                    <img src="${profileImage}" alt="${username}">
                </div>
                <div class="profile-info">
                    <h2>@${username}</h2>
                    <div class="profile-stats">
                        <span><strong>${account.post_count}</strong> posts</span>
                        <span><strong>${followCount.follower_count}</strong> followers</span>
                        <span><strong>${followCount.following_count}</strong> following</span>
                    </div>
                    <div class="profile-bio">
                        ${account.json_metadata?.profile?.about || ''}
                    </div>
                </div>
            </div>
            <div class="profile-posts">
                <h3>Posts</h3>
                <div class="posts-grid" id="profile-posts-grid"></div>
                <div class="profile-loading-indicator" style="display: none;">
                    <div class="spinner"></div>
                </div>
            </div>
        `;

        // Configura l'infinite scroll prima di caricare i post
        setupProfileInfiniteScroll(username);
        
        // Poi carichiamo i post in modo asincrono
        await loadMoreProfilePosts(username, false);

    } catch (error) {
        console.error('Failed to load profile:', error);
        document.getElementById('profile-view').innerHTML =
            '<div class="error-message">Failed to load profile</div>';
    }
}

async function loadMoreProfilePosts(username, append = true) {
    if (isLoadingProfile || !hasMoreProfilePosts) return;

    try {
        isLoadingProfile = true;
        showProfileLoadingIndicator();

        const query = {
            tag: username,
            limit: 12
        };

        if (profileLastPost) {
            query.start_author = profileLastPost.author;
            query.start_permlink = profileLastPost.permlink;
        }

        const posts = await steem.api.getDiscussionsByBlogAsync(query);

        if (posts.length < query.limit) {
            hasMoreProfilePosts = false;
        }

        if (posts.length > 0) {
            profileLastPost = posts[posts.length - 1];
            
            const postsGrid = document.getElementById('profile-posts-grid');
            if (!postsGrid) return;

            const postsHTML = await Promise.all(posts.map(async post => {
                let imageUrl = extractImageFromContent(post);
                // Se non troviamo un'immagine nel post, usiamo l'avatar dell'autore come fallback
                if (!imageUrl) {
                    const [authorAccount] = await steem.api.getAccountsAsync([post.author]);
                    imageUrl = authorAccount ? extractProfileImage(authorAccount) : null;
                }
                return `
                    <div class="profile-post" onclick="window.location.hash='#/post/${post.author}/${post.permlink}'">
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
        }

    } catch (error) {
        console.error('Failed to load profile posts:', error);
    } finally {
        isLoadingProfile = false;
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
        const postImage = extractImageFromContent(post);

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
                        <span><i class="far fa-heart"></i> ${post.net_votes} votes</span>
                        <span><i class="far fa-comment"></i> ${post.children} comments</span>
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

    } catch (error) {
        console.error('Failed to load post:', error);
        document.getElementById('post-view').innerHTML = `
            <div class="error-message">Failed to load post</div>
        `;
    }
}

function setupProfileInfiniteScroll(username) {
    // Rimuovi eventuali handler precedenti
    window.removeEventListener('scroll', window._profileScrollHandler);
    
    // Crea un nuovo handler e salvalo globalmente per poterlo rimuovere in seguito
    window._profileScrollHandler = () => {
        // Verifica che siamo ancora nella vista del profilo
        const profileView = document.getElementById('profile-view');
        if (!profileView || profileView.style.display === 'none') return;

        // Verifica che siamo nel profilo corretto
        const currentProfileUsername = profileView.querySelector('.profile-header h2')?.textContent?.slice(1);
        if (currentProfileUsername !== username) return;

        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollHeight - scrollTop - clientHeight < 100) {
            loadMoreProfilePosts(username, true);
        }
    };

    // Aggiungi il nuovo handler
    window.addEventListener('scroll', window._profileScrollHandler);
}

function showProfileLoadingIndicator() {
    const indicator = document.querySelector('.profile-loading-indicator');
    if (indicator) indicator.style.display = 'block';
}

function hideProfileLoadingIndicator() {
    const indicator = document.querySelector('.profile-loading-indicator');
    if (indicator) indicator.style.display = 'none';
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
