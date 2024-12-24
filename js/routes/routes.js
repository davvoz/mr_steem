import { hideAllViews, showView } from '../utils/view-manager.js';
import { steemConnection, showLoginModal } from '../auth/login-manager.js';
import { renderNotifications, storeNotificationsState } from '../services/notification-manager.js';
import { searchService } from '../services/search-service.js';
import { loadCommunity } from '../services/community-manager.js';
import { loadSinglePost, loadSingleComment } from '../services/posts/post-service.js';
import { loadUserProfile } from '../services/profile/profile-service.js';
import { loadHomeFeed, resetHomeFeed } from '../services/posts-manager.js';
import { loadPostsByTag } from '../services/tag/tag-service.js';
export const routes = {
    '/': {
        template: 'home-view',
        handler: async () => {
            hideAllViews();
            showView('home-view');
            resetHomeFeed(); // Reset feed state before loading
            await loadHomeFeed(false); // Pass false to load fresh content
        }
    },
    '/explore': {
        viewId: 'explore-view',
        handler: async () => {
            hideAllViews();
            showView('explore-view');
            if (steemConnection) {
                await loadExploreContent();
            }
        }
    },
    '/activity': {
        viewId: 'activity-view',
        handler: () => {
            hideAllViews();
            showView('activity-view');
            showLikedPosts();
        }
    },
    '/profile': {
        viewId: 'profile-view',
        handler: async () => {
            hideAllViews();
            showView('profile-view');
            if (!steemConnection.isConnected) {
                showLoginModal();
                return;
            }
            await loadUserProfile(steemConnection.username);
        }
    },
    '/profile/:username': {
        viewId: 'profile-view',
        handler: async (params) => {
            hideAllViews();
            showView('profile-view');
            await loadUserProfile(params.username);
        }
    },
    '/suggestions': {
        viewId: 'suggestions-view',
        handler: async () => {
            hideAllViews();
            showView('suggestions-view');
            await loadExtendedSuggestions();
        }
    },
    '/post/:author/:permlink': {
        viewId: 'post-view',
        handler: async (params) => {
            hideAllViews();
            showView('post-view');
            await loadSinglePost(params.author, params.permlink);
        }
    },
    '/notifications': {
        viewId: 'notifications-view',
        handler: async () => {
            hideAllViews();
            
            // Close mobile navigation menu
            const navMenu = document.querySelector('.nav-menu');
            const hamburgerButton = document.querySelector('.hamburger-button');
            if (window.innerWidth <= 768) {
                navMenu.classList.remove('active');
                if (hamburgerButton) {
                    hamburgerButton.classList.remove('active');
                }
                // Ensure body scroll is enabled
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
            }
            
            showView('notifications-view');
            await renderNotifications();
        }
    },
    '/search': {
        viewId: 'search-view',
        handler: async () => {
            hideAllViews();
            showView('search-view');
            setupSearchView();
        }
    },
    '/community/:name': {
        viewId: 'community-view',
        handler: async (params) => {
            hideAllViews();
            showView('community-view');
            // Get community data from the search results if available
            const communityData = window.searchResults?.communities?.find(c => c.name === params.name);
            await loadCommunity(params.name, communityData);
        }
    },
    '/tag/:tag': {
        viewId: 'home-view',
        handler: async (params) => {
            hideAllViews();
            showView('home-view');

            // Attiva il bottone del tag corrispondente
            document.querySelectorAll('.tag-button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tag === params.tag);
            });

            await loadPostsByTag(params.tag);
        }
    },
    '/notification/:author/:permlink': {
        viewId: 'notification-context-view',
        handler: async (params) => {
            if (document.getElementById('notifications-view')?.style.display !== 'none') {
                storeNotificationsState();
            }

            hideAllViews();
            showView('post-view');
            
            try {
                // First try to load the post directly
                const post = await loadSinglePost(params.author, params.permlink);
                
                if (!post || !post.body) {
                    console.error('Failed to load post directly, trying parent post');
                    // If post not found, might be a comment, try to load parent post
                    const content = await steem.api.getContentAsync(params.author, params.permlink);
                    if (content && content.parent_author) {
                        await loadSinglePost(content.parent_author, content.parent_permlink);
                    }
                }

                const contextHeader = document.createElement('div');
                contextHeader.className = 'notification-context-header';
                
                contextHeader.innerHTML = `
                    <div class="notification-context-nav">
                        <button class="back-button">
                            <i class="fas fa-arrow-left"></i> Back to Notifications
                        </button>
                    </div>
                `;
                
                contextHeader.querySelector('.back-button').addEventListener('click', (e) => {
                    e.preventDefault();
                    window.location.hash = '/notifications';
                });
                
                const postView = document.getElementById('post-view');
                postView.insertBefore(contextHeader, postView.firstChild);
            } catch (error) {
                console.error('Error loading notification content:', error);
            }
        }
    },
    '/comment/:author/:permlink': {
        viewId: 'post-view', // Usa post-view invece di comment-view
        handler: async (params) => {
            hideAllViews();
            showView('post-view');
            await loadSingleComment(params.author, params.permlink);
        }
    },
};

async function showLikedPosts() {
    try {
        const modal = document.getElementById('likesModal');
        const container = document.getElementById('liked-posts-list');
        if (!modal || !container) {
            console.error('Required DOM elements not found');
            return;
        }

        container.innerHTML = '<p>Loading liked posts...</p>';
        modal.style.display = 'flex';

        // Get user's voting history
        const votes = await steem.api.getAccountVotesAsync(steemUsername);

        if (!votes || votes.length === 0) {
            container.innerHTML = '<p>No liked posts found</p>';
            return;
        }

        // Get details for each voted post
        const likedPosts = [];
        for (const vote of votes.slice(-20)) {
            try {
                const post = await steem.api.getContentAsync(vote.author, vote.permlink);
                if (post && post.parent_author === '') {
                    likedPosts.push(post);
                }
            } catch (error) {
                console.warn('Error fetching post:', error);
            }
        }

        if (likedPosts.length === 0) {
            container.innerHTML = '<p>No viewable liked posts found</p>';
            return;
        }

        container.innerHTML = likedPosts.map(post => {
            const imgRegex = /<img[^>]+src="([^">]+)"/;
            const imgMatch = post.body.match(imgRegex);
            const imageUrl = imgMatch ? imgMatch[1] : 'https://via.placeholder.com/50';

            return `
                <div class="liked-post">
                    <img src="${imageUrl}" alt="Post thumbnail">
                    <div class="liked-post-info">
                        <strong>${post.author}</strong>
                        <p>${post.title}</p>
                        <small>${new Date(post.created).toLocaleDateString()}</small>
                    </div>
                    <div class="post-stats">
                        <small>${post.net_votes} votes</small>
                        <small>$${parseFloat(post.pending_payout_value).toFixed(2)}</small>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Failed to load liked posts:', error);
        const container = document.getElementById('liked-posts-list');
        if (container) {
            container.innerHTML = '<p>Error loading liked posts. Please try again.</p>';
        }
    }
}

async function setupSearchView() {
    const searchView = document.getElementById('search-view');
    if (!searchView) {
        console.error('Search view not found');
        return;
    }

    // Controlla se siamo su mobile
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        searchView.innerHTML = `
            <div class="search-container">
                <div class="search-tabs">
                    <div class="search-tab active" data-section="profiles">Users</div>
                    <div class="search-tab" data-section="communities">Communities</div>
                    <div class="search-tab" data-section="tags">Tags</div>
                </div>

                <div class="search-sections">
                    <div class="search-section profiles-section active">
                        <div class="search-bar">
                            <i class="fas fa-search"></i>
                            <input type="text" placeholder="Search profiles...">
                            <i class="fas fa-times clear-search" style="display: none;"></i>
                        </div>
                        <div class="profiles-results"></div>
                    </div>

                    <div class="search-section communities-section">
                        <div class="search-bar">
                            <i class="fas fa-search"></i>
                            <input type="text" placeholder="Search communities...">
                            <i class="fas fa-times clear-search" style="display: none;"></i>
                        </div>
                        <div class="communities-results"></div>
                    </div>

                    <div class="search-section tags-section">
                        <div class="search-bar">
                            <i class="fas fa-search"></i>
                            <input type="text" placeholder="Search tags...">
                            <i class="fas fa-times clear-search" style="display: none;"></i>
                        </div>
                        <div class="tags-results"></div>
                    </div>
                </div>
            </div>
        `;

        // Gestione dei tab
        const tabs = searchView.querySelectorAll('.search-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Rimuovi active da tutti i tab e sezioni
                tabs.forEach(t => t.classList.remove('active'));
                searchView.querySelectorAll('.search-section').forEach(s => s.classList.remove('active'));
                
                // Attiva il tab cliccato e la sua sezione
                tab.classList.add('active');
                const section = searchView.querySelector(`.${tab.dataset.section}-section`);
                section.classList.add('active');
                
                // Focus sull'input della sezione attiva
                section.querySelector('input').focus();
            });
        });
    } else {
        // Mantieni il layout desktop esistente
        searchView.innerHTML = `
            <div class="search-container">
                <div class="search-section profiles-section">
                    <div class="search-bar">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Search profiles...">
                        <i class="fas fa-times clear-search" style="display: none;"></i>
                    </div>
                    <div class="profiles-results"></div>
                </div>

                <div class="search-section communities-section">
                    <div class="search-bar">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Search communities...">
                        <i class="fas fa-times clear-search" style="display: none;"></i>
                    </div>
                    <div class="communities-results"></div>
                </div>

                <div class="search-section tags-section">
                    <div class="search-bar">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="Search tags...">
                        <i class="fas fa-times clear-search" style="display: none;"></i>
                    </div>
                    <div class="tags-results"></div>
                </div>
            </div>
        `;
    }

    // Setup dei gestori di ricerca per ogni sezione
    const sections = ['profiles', 'communities', 'tags'];
    sections.forEach(section => {
        const sectionElement = searchView.querySelector(`.${section}-section`);
        if (!sectionElement) {
            console.error(`Section ${section} not found`);
            return;
        }
        
        const input = sectionElement.querySelector('.search-bar input');
        if (input) {
            setupSearchHandler(input, section);
        } else {
            console.error(`Input not found in ${section} section`);
        }
    });
}

function setupSearchHandler(input, section) {
    if (!input) {
        console.error(`Search input for ${section} section not found`);
        return;
    }

    const parentElement = input.closest('.search-section');
    if (!parentElement) {
        console.error(`Parent .search-section not found for ${section}`);
        return;
    }

    const clearButton = parentElement.querySelector('.clear-search');
    const resultsContainer = parentElement.querySelector(`.${section}-results`);

    if (!clearButton || !resultsContainer) {
        console.error(`Required elements not found for ${section} section`);
        return;
    }

    clearButton.addEventListener('click', () => {
        input.value = '';
        clearButton.style.display = 'none';
        resultsContainer.innerHTML = '';
    });

    let searchTimeout;
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearButton.style.display = query ? 'block' : 'none';

        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch(query, section, resultsContainer);
        }, 300);
    });
}

async function performSearch(query, section, resultsContainer) {
    resultsContainer.innerHTML = '<div class="loading">Searching...</div>';

    try {
        const results = await searchService.search(query);
        if (!results) return;

        if (section === 'profiles') {
            resultsContainer.innerHTML = `
                <h3>Profiles</h3>
                ${results.profiles.length ? results.profiles.map(user => `
                    <div class="user-result" onclick="window.location.hash='/profile/${user.username}'">
                        <img src="${user.avatar}" alt="${user.username}">
                        <div class="user-info">
                            <span class="username">@${user.username}</span>
                            <span class="reputation">Rep: ${user.reputation}</span>
                        </div>
                    </div>
                `).join('') : '<p>No profiles found</p>'}
            `;
        } else if (section === 'communities') {
            resultsContainer.innerHTML = `
                <h3>Communities</h3>
                ${results.communities.length ? results.communities.map(community => `
                    <div class="community-result" onclick="window.location.hash='/community/${community.name}'">
                        <img src="${community.icon}" alt="${community.name}">
                        <div class="community-info">
                            <span class="community-name">${community.title}</span>
                            <span class="community-stats">${community.subscribers} subscribers</span>
                            ${community.about ? `<p class="community-about">${community.about.substring(0, 100)}...</p>` : ''}
                        </div>
                    </div>
                `).join('') : '<p>No communities found</p>'}
            `;
        } else if (section === 'tags') {
            resultsContainer.innerHTML = `
                <h3>Tags</h3>
                ${results.tags.length ? results.tags.map(tag => `
                    <div class="tag-result" onclick="window.location.hash='/tag/${tag.name}'">
                        <div class="tag-info">
                            <span class="tag-name">#${tag.name}</span>
                            <span class="tag-stats">${tag.posts_count} posts</span>
                        </div>
                    </div>
                `).join('') : '<p>No tags found</p>'}
            `;
        }
    } catch (error) {
        resultsContainer.innerHTML = '<div class="error">Search failed. Please try again.</div>';
    }
}