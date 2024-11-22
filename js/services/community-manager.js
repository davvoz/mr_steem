import { extractImageFromContent } from './posts-manager.js';

async function withTimeout(promise, timeout = 10000) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(`Request timed out after ${timeout}ms`));
                }, timeout);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function retryWithFallback(fn, retries = 3) {
    const fallbackNodes = [
        'https://api.steemit.com',
        'https://api.steemitdev.com',
        'https://api.steemzzang.com'
    ];

    for (let i = 0; i < retries; i++) {
        for (const node of fallbackNodes) {
            try {
                steem.api.setOptions({ url: node });
                return await withTimeout(fn());
            } catch (error) {
                console.warn(`Attempt ${i + 1} failed for node ${node}:`, error);
                continue;
            }
        }
    }
    throw new Error('All retry attempts failed');
}

function processCommunityData(communityData, name) {
    // Extract and organize data sections
    const sections = {
        feed: communityData.feed_price || {},
        props: communityData.props || {},
        content: processCommunityContent(communityData.content),
        tags: communityData.tags || {},
        discussion: communityData.discussion_idx?.[name] || []
    };

    // Validate community data structure
    const validation = {
        hasFeedPrice: !!sections.feed.base && !!sections.feed.quote,
        hasProps: Object.keys(sections.props).length > 0,
        hasContent: sections.content.length > 0,
        hasDiscussionIndex: !!communityData.discussion_idx
    };

    // Log debug info
    console.debug('Community data processed:', {
        name,
        validation,
        contentCount: sections.content.length,
        hasDiscussionIndex: validation.hasDiscussionIndex
    });

    return { sections, validation };
}

function processCommunityContent(content = {}) {
    return Object.entries(content)
        .map(([key, post]) => ({
            author: post.author,
            permlink: post.permlink,
            title: post.title,
            created: post.created,
            category: post.category
        }))
        .sort((a, b) => new Date(b.created) - new Date(a.created));
}

let currentObserver = null; // Store the current observer

function cleanupInfiniteScroll() {
    if (currentObserver) {
        currentObserver.disconnect();
        currentObserver = null;
    }
}

function setupInfiniteScroll(name, lastPost) {
    // Cleanup any existing observer
    cleanupInfiniteScroll();

    const postsGrid = document.querySelector('.posts-grid');
    if (!postsGrid) {
        console.warn('Posts grid not found, cannot setup infinite scroll');
        return;
    }

    // Create sentinel only if we have a lastPost and more posts might be available
    if (!lastPost) {
        console.warn('No last post available, skipping infinite scroll setup');
        return;
    }

    currentObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadCommunityPosts(name, lastPost.author, lastPost.permlink);
            }
        });
    });

    // Remove any existing sentinel
    const oldSentinel = postsGrid.querySelector('.scroll-sentinel');
    if (oldSentinel) {
        oldSentinel.remove();
    }

    // Add new sentinel
    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    postsGrid.appendChild(sentinel);
    currentObserver.observe(sentinel);
}

export async function loadCommunity(name) {
    try {
        cleanupInfiniteScroll();

        const container = document.querySelector('#community-view');
        if (!container) {
            throw new Error('Community view container not found');
        }

        container.innerHTML = '<div class="loading-indicator"><div class="spinner"></div></div>';

        // Use retry wrapper for API calls
        const [communityData, communityPosts] = await Promise.all([
            retryWithFallback(() => steem.api.getStateAsync(`/trending/${name}`)),
            retryWithFallback(() => steem.api.getDiscussionsByCreatedAsync({ tag: name, limit: 20 }))
        ]);

        // Validate response data
        if (!communityData || !communityPosts) {
            throw new Error('Invalid response from Steem API');
        }

        // Process and validate community data
        const { sections, validation } = processCommunityData(communityData, name);
        
        // Add additional validation
        if (!validation.hasContent) {
            throw new Error('Community has no content');
        }

        const community = communityData;
        if (!community) {
            throw new Error('Community not found');
        }

        // Enhance community object with processed data
        community.posts = sections.content;
        community.discussionIndex = sections.discussion;
console.log(community);
        // Renderizza la pagina della community
        container.innerHTML = `
            <div class="community-header">
                ${community.cover_image ? `
                    <div class="community-banner" style="background-image: url('${community.cover_image}')"></div>
                ` : ''}
                <div class="community-info">
                    <img src="${community.avatar_url || 'default-community-avatar.png'}" 
                         alt="${community.title}" 
                         class="community-avatar">
                    <div class="community-details">
                        <h1 class="community-title">${name}</h1>
                        <div class="community-stats">
                            <span><strong>${community.subscribers}</strong> Members</span>
                            <span><strong>${community.num_pending}</strong> Posts</span>
                            <span><strong>${community.num_authors}</strong> Authors</span>
                        </div>
                        <p class="community-description">${community.description || 'No description available'}</p>
                        <div class="community-actions">
                            <button class="join-button" onclick="joinCommunity('${name}')">
                                ${community.is_subscribed ? 'Joined' : 'Join'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="community-posts">
                <h3>Latest Posts</h3>
                <div class="posts-grid"></div>
            </div>
        `;

        // Renderizza i post
        const postsGrid = container.querySelector('.posts-grid');
        const postsHTML = await Promise.all(communityPosts.map(async post => {
            const imageUrl = extractImageFromContent(post);
            return `
                <div class="profile-post" 
                     onclick="window.location.hash='#/post/${post.author}/${post.permlink}'">
                    ${imageUrl
                    ? `<img src="${imageUrl}" alt="${post.title}" loading="lazy">`
                    : '<div class="no-image">No Image</div>'
                }
                </div>
            `;
        }));

        postsGrid.innerHTML = postsHTML.join('');

        // Setup infinite scroll only after DOM is updated and if we have posts
        if (communityPosts && communityPosts.length > 0) {
            // Give the DOM time to update
            setTimeout(() => {
                setupInfiniteScroll(name, communityPosts[communityPosts.length - 1]);
            }, 100);
        }

    } catch (error) {
        console.error('Failed to load community:', error);
        if (document.querySelector('#community-view')) {
            document.querySelector('#community-view').innerHTML = `
                <div class="error-message">
                    Failed to load community. 
                    <p>${error.message}</p>
                    <button class="retry-button" onclick="window.location.reload()">Retry</button>
                </div>`;
        }
    }
}

function renderCommunityHeader(community) {
    const header = document.querySelector('.community-header');

    header.innerHTML = `
        ${community.banner_image ? `
            <div class="community-banner" 
                 style="background-image: url('${community.banner_image}')">
            </div>
        ` : ''}
        <div class="community-info">
            <img src="${community.avatar_url || 'default-community-avatar.png'}" 
                 alt="${community.title}" 
                 class="community-avatar">
            <div class="community-details">
                <h1 class="community-title">${community.title}</h1>
                <div class="community-stats">
                    <span>${community.subscribers} members</span>
                    <span>${community.num_pending} posts</span>
                </div>
                <p class="community-description">${community.description}</p>
                <div class="community-actions">
                    <button class="join-button" onclick="joinCommunity('${community.name}')">
                        ${community.is_subscribed ? 'Joined' : 'Join'}
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function loadCommunityPosts(name, last_author = '', last_permlink = '') {
    try {
        const query = {
            tag: name,
            limit: 20,
            start_author: last_author,
            start_permlink: last_permlink
        };

        const posts = await steem.api.getDiscussionsByCreatedAsync(query);
        // Fix: Use .posts-grid instead of .community-posts-grid
        const postsGrid = document.querySelector('.posts-grid');
        
        if (!postsGrid) {
            console.warn('Posts grid element not found');
            return;
        }

        const postsHTML = await Promise.all(posts.map(async post => {
            const imageUrl = extractImageFromContent(post);
            return `
                <div class="profile-post" 
                     onclick="window.location.hash='#/post/${post.author}/${post.permlink}'">
                    ${imageUrl
                    ? `<img src="${imageUrl}" alt="${post.title}" loading="lazy">`
                    : '<div class="no-image">No Image</div>'
                }
                </div>
            `;
        }));

        if (last_author === '') {
            postsGrid.innerHTML = postsHTML.join('');
        } else {
            postsGrid.insertAdjacentHTML('beforeend', postsHTML.join(''));
        }

        setupInfiniteScroll(name, posts[posts.length - 1]);

    } catch (error) {
        console.error('Failed to load community posts:', error);
        const postsGrid = document.querySelector('.posts-grid');
        if (postsGrid) {
            postsGrid.innerHTML = '<div class="error-message">Failed to load posts</div>';
        }
    }
}

export async function joinCommunity(name) {
    if (!steemConnection.isConnected) {
        showLoginModal();
        return;
    }

    try {
        const operations = [
            ['custom_json', {
                required_auths: [],
                required_posting_auths: [steemConnection.username],
                id: 'community',
                json: JSON.stringify(['subscribe', {
                    community: name
                }])
            }]
        ];

        await steem.broadcast.sendAsync(
            { operations: operations, extensions: [] },
            { posting: sessionStorage.getItem('steemPostingKey') }
        );

        // Aggiorna UI
        const button = document.querySelector('.join-button');
        button.textContent = 'Joined';
        button.classList.add('joined-button');

    } catch (error) {
        console.error('Failed to join community:', error);
        alert('Failed to join community: ' + error.message);
    }
}