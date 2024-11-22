import { hideAllViews, showView } from '../utils/view-manager.js';
import { steemConnection, showLoginModal } from '../auth/login-manager.js';
import { loadSteemPosts, loadStories, loadExploreContent, setupInfiniteScroll, loadUserProfile, loadExtendedSuggestions, updateSidebar, loadSinglePost, resetPostsState, cleanupInfiniteScroll } from '../services/posts-manager.js';
import { renderNotifications } from '../services/notification-manager.js';

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
    }
};