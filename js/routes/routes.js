import { hideAllViews, showView } from '../utils/view-manager.js';
import { steemConnection, showLoginModal } from '../auth/login-manager.js';
import { loadSteemPosts, loadStories, loadExploreContent, setupInfiniteScroll, loadUserProfile, loadExtendedSuggestions, updateSidebar, loadSinglePost, resetPostsState, cleanupInfiniteScroll } from '../services/posts-manager.js';
import { renderNotifications } from '../services/notification-manager.js';
import { searchService } from '../services/search-service.js';
import { loadCommunity } from '../services/community-manager.js';

export const routes = {
    '/': { 
        viewId: 'home-view',
        handler: async () => {
            // Cleanup before setting up new scroll
            cleanupInfiniteScroll();
            
            hideAllViews();
            showView('home-view');
            
            // Reset posts state
            resetPostsState();
            
            // Reset pagination state
            window.lastPost = null;
            window.hasMorePosts = true;
            
            await loadSteemPosts();
            if (steemConnection.isConnected) {
                await loadStories();
                updateSidebar();
            }
            setupInfiniteScroll();
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
    }
};

async function setupSearchView() {
    const searchView = document.getElementById('search-view');
    if (!searchView) return;

    searchView.innerHTML = `
        <div class="search-container">
            <div class="search-section">
                <div class="search-bar">
                    <i class="fas fa-user"></i>
                    <input type="text" id="users-search-input" placeholder="Search profiles...">
                    <i class="fas fa-times clear-search" style="display: none;"></i>
                </div>
                <div class="profiles-results"></div>
            </div>

            <div class="search-section">
                <div class="search-bar">
                    <i class="fas fa-users"></i>
                    <input type="text" id="communities-search-input" placeholder="Search communities...">
                    <i class="fas fa-times clear-search" style="display: none;"></i>
                </div>
                <div class="communities-results"></div>
            </div>
        </div>
    `;

    setupSearchHandlers('users-search-input', 'profiles');
    setupSearchHandlers('communities-search-input', 'communities');
}

function setupSearchHandlers(inputId, type) {
    const searchInput = document.getElementById(inputId);
    const clearButton = searchInput.parentElement.querySelector('.clear-search');
    const resultsContainer = document.querySelector(`.${type}-results`);

    searchInput.focus();

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clearButton.style.display = 'none';
        resultsContainer.innerHTML = '';
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearButton.style.display = query ? 'block' : 'none';

        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            resultsContainer.innerHTML = '<div class="loading">Searching...</div>';

            try {
                const results = await searchService.search(query);
                if (!results) return;

                if (type === 'profiles') {
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
                } else {
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
                }
            } catch (error) {
                resultsContainer.innerHTML = '<div class="error">Search failed. Please try again.</div>';
            }
        }, 300);
    });
}