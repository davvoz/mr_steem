
import { loadSteemPosts } from '../post/post-service.js';
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

export function setupInfiniteScroll(type = 'home') {
    // Remove existing scroll listeners
    cleanupInfiniteScroll();
    
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
    // Remove all scroll handlers
    ['_homeScrollHandler', '_profileScrollHandler'].forEach(key => {
        if (window[key]) {
            window.removeEventListener('scroll', window[key]);
            window[key] = null;
        }
    });
}