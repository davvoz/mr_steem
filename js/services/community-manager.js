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

function transformCommunityData(communityData, name) {
    // First try to find the community info in the state data
    const communityKey = `hive-${name}`;
    console.log('Looking for community key:', communityKey, 'in:', communityData);
    
    // Try to find community info in different possible locations
    const communityInfo = {
        ...communityData[communityKey],           // Try direct access
        ...communityData.content[communityKey],   // Try in content
        ...(communityData.community || {})        // Try in community field
    };

    console.log('Found community info:', communityInfo);

    // Extract community info from the API response with better fallbacks
    return {
        name: name,
        title: communityInfo.title || communityInfo.community_title || name,
        icon: communityInfo.avatar || communityInfo.community_avatar || communityInfo.icon || 'default-community-avatar.png',
        about: communityInfo.about || communityInfo.description || communityInfo.community_description || 'No description available',
        subscribers: parseInt(communityInfo.subscribers || communityInfo.member_count || 0),
        num_pending: parseInt(communityInfo.num_pending || communityInfo.pending_posts || 0),
        num_authors: parseInt(communityInfo.num_authors || communityInfo.active_authors || 0),
        is_subscribed: !!communityInfo.is_subscribed,
        cover_image: communityInfo.cover_image || communityInfo.banner_image || communityInfo.community_banner
    };
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

export async function loadCommunity(name, searchData = null) {
    try {
        cleanupInfiniteScroll();

        const container = document.querySelector('#community-view');
        if (!container) {
            throw new Error('Community view container not found');
        }

        container.innerHTML = '<div class="loading-indicator"><div class="spinner"></div></div>';

        // If we have searchData, use it directly without transforming
        let community = searchData;
        
        if (!community) {
            // Only fetch community data if we don't have search data
            const communitiesResponse = await fetch('https://develop-imridd.eu.pythonanywhere.com/api/steem/communities');
            const allCommunities = await communitiesResponse.json();
            community = allCommunities.find(c => c.name === name);
            
            if (community) {
                // Transform to match search format
                community = {
                    name: community.name,
                    title: community.title || community.name,
                    about: community.about || '',
                    subscribers: community.subscribers || 0,
                    icon: community.avatar_url || `https://steemitimages.com/u/${community.name}/avatar/small`
                };
            }
        }

        // Fetch posts separately
        const communityPosts = await retryWithFallback(() => 
            steem.api.getDiscussionsByCreatedAsync({ tag: name, limit: 20 })
        );

        if (!community || !communityPosts) {
            throw new Error('Failed to load community data');
        }

        // Add posts to community object
        community.posts = communityPosts;

        // Renderizza la pagina della community
        container.innerHTML = `
            <div class="community-header">
                ${community.cover_image ? `
                    <div class="community-banner" style="background-image: url('${community.cover_image}')"></div>
                ` : ''}
                <div class="community-info">
                    <img src="${community.icon}" 
                         alt="${community.title}" 
                         class="community-avatar">
                    <div class="community-details">
                        <h1 class="community-title">${community.title}</h1>
                        <div class="community-stats">
                            <span><strong>${community.subscribers}</strong> subscribers</span>
                        </div>
                        <p class="community-description">${community.about || 'No description available'}</p>
                        <div class="community-actions">
                            <button class="join-button ${community.is_subscribed ? 'joined' : ''}" onclick="joinCommunity('${community.name}')">
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

        // Make sure posts grid exists before continuing
        const postsGrid = container.querySelector('.posts-grid');
        if (!postsGrid) {
            throw new Error('Posts grid container not found after creation');
        }

        // Renderizza i post
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