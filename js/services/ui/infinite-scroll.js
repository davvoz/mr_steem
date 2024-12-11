import { loadSteemPosts } from '../posts/post-service.js';
import { loadMoreProfilePosts } from '../profile/profile-service.js';
import { showLoadingIndicator, hideLoadingIndicator } from './loading-indicators.js';

let loadingLock = false;

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

function resetLoadingState() {
    loadingLock = false;
    hideLoadingIndicator();
}

export function setupInfiniteScroll(type = 'home') {
    if (type === 'post') return;
    
    // Reset state and remove existing listeners
    resetLoadingState();
    cleanupInfiniteScroll();
    
    // Reset scroll position for new profile
    if (type === 'profile') {
        window.scrollTo(0, 0);
    }
    
    // Create new optimized scroll handler based on type
    const handler = throttle(() => {
        if (loadingLock) return;
        
        const scrollPosition = window.innerHeight + window.pageYOffset;
        const threshold = document.documentElement.scrollHeight - 1000;
        
        if (scrollPosition >= threshold) {
            requestAnimationFrame(async () => {
                try {
                    loadingLock = true;
                    showLoadingIndicator();
                    
                    if (type === 'profile') {
                        const username = window.location.hash.split('/')[2];
                        // Add a small delay to ensure proper positioning
                        await new Promise(resolve => setTimeout(resolve, 100));
                        await loadMoreProfilePosts(username, true);
                    } else {
                        await loadSteemPosts();
                    }
                } catch (error) {
                    console.error('Error loading more posts:', error);
                } finally {
                    loadingLock = false;
                    hideLoadingIndicator();
                }
            });
        }
    }, 150);

    // Store the handler reference based on type
    const scrollKey = `_${type}ScrollHandler`;
    window[scrollKey] = handler;
    window.addEventListener('scroll', handler, { passive: true });
}

export function cleanupInfiniteScroll() {
    // Reset loading state and scroll position
    resetLoadingState();
    window.scrollTo(0, 0);
    
    // Remove all scroll handlers
    ['_homeScrollHandler', '_profileScrollHandler'].forEach(key => {
        if (window[key]) {
            window.removeEventListener('scroll', window[key]);
            window[key] = null;
        }
    });
}