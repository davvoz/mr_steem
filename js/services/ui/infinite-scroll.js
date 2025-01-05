import { loadSteemPosts } from '../posts/post-service.js';
import { loadMoreProfilePosts } from '../profile/profile-service.js';
import { showLoadingIndicator, hideLoadingIndicator } from './loading-indicators.js';

let scrollHandler = null;
let isLoading = false;

export function setupInfiniteScroll(loadMoreFunction) {
    // Cleanup any existing scroll handler
    cleanupInfiniteScroll();

    // Create new scroll handler
    scrollHandler = async () => {
        if (isLoading) return;

        const scrollPosition = window.innerHeight + window.scrollY;
        const documentHeight = document.documentElement.offsetHeight;
        
        // Load more when user scrolls near bottom (200px threshold)
        if (documentHeight - scrollPosition < 200) {
            isLoading = true;
            await loadMoreFunction();
            isLoading = false;
        }
    };

    // Add scroll event listener
    window.addEventListener('scroll', scrollHandler);
}

export function cleanupInfiniteScroll() {
    if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler);
        scrollHandler = null;
    }
    isLoading = false;
}