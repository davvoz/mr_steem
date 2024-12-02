import { hideAllViews, showView } from '../utils/view-manager.js';
import { steemConnection, showLoginModal } from '../auth/login-manager.js';
import { renderNotifications } from '../services/notification-manager.js';
import { searchService } from '../services/search-service.js';
import { loadCommunity } from '../services/community-manager.js';
import { loadSinglePost } from '../services/post/post-service.js';
import { loadUserProfile } from '../services/profile/profile-service.js';
import { loadHomeFeed, resetHomeFeed } from '../services/posts-manager.js';
import { extractProfileImage } from '../services/post/post-utils.js';
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
    }
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
                    //usiamo la nostra funzione per caricare le immagini dei profili
                    //  results.profiles.forEach(profile => {
                    //     profile.avatar = extractImageFromProfile(profile);
                    // }   
                    // );
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