import { showLoadingIndicator, hideLoadingIndicator } from '../ui/loading-indicators.js';
import { displayPosts } from '../posts-manager.js';

let lastPost = null;
let isLoading = false;
let hasMore = true;
let currentTag = null;

export async function loadPostsByTag(tag, append = false) {
    if (isLoading) return;
    
    try {
        isLoading = true;
        if (!append) {
            showLoadingIndicator();
            const container = document.getElementById('posts-container');
            container.innerHTML = '<div class="loading-spinner"></div>';
        }

        const query = {
            tag: tag,
            limit: 20,
            start_author: lastPost ? lastPost.author : undefined,
            start_permlink: lastPost ? lastPost.permlink : undefined
        };

        // Use getDiscussionsByCreated for better results
        const posts = await steem.api.getDiscussionsByCreatedAsync(query);
        
        // Strict filtering of posts
        const filteredPosts = posts.filter(post => {
            try {
                const metadata = JSON.parse(post.json_metadata);
                const postTags = metadata.tags || [];
                return postTags.includes(tag.toLowerCase());
            } catch (error) {
                console.warn('Failed to parse post metadata:', error);
                return false;
            }
        });

        if (filteredPosts.length === 0) {
            const container = document.getElementById('posts-container');
            container.innerHTML = `
                <div class="no-posts">
                    <p>No posts found for #${tag}</p>
                    <div class="tag-actions">
                        <button class="retry-button" onclick="window.location.hash='/tag/${tag}'">Try Again</button>
                        <button class="try-tags-button" onclick="window.location.hash='/search#tags=${tag}'">
                            <i class="fas fa-tags"></i> Search in Tags
                        </button>
                    </div>
                </div>`;
            return;
        }

        // Update last post reference for pagination
        if (filteredPosts.length > 0) {
            lastPost = filteredPosts[filteredPosts.length - 1];
        }

        await displayPosts(filteredPosts, 'posts-container', append);
        currentTag = tag;

    } catch (error) {
        console.error('Error loading posts by tag:', error);
        const container = document.getElementById('posts-container');
        container.innerHTML = `
            <div class="error-message">
                Failed to load posts for #${tag}
                <button onclick="window.location.reload()">Retry</button>
            </div>`;
    } finally {
        isLoading = false;
        hideLoadingIndicator();
    }
}

function setupTagScrollHandler(tag) {
    if (window._tagScrollHandler) {
        window.removeEventListener('scroll', window._tagScrollHandler);
    }

    window._tagScrollHandler = () => {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000) {
            loadPostsByTag(tag, true);
        }
    };

    window.addEventListener('scroll', window._tagScrollHandler);
}

export function resetTagState() {
    lastPost = null;
    isLoading = false;
    hasMore = true;
    currentTag = null;
    
    if (window._tagScrollHandler) {
        window.removeEventListener('scroll', window._tagScrollHandler);
        window._tagScrollHandler = null;
    }

    const container = document.getElementById('posts-container');
    if (container) {
        container.innerHTML = '';
    }
}