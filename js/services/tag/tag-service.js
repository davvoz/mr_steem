import { showLoadingIndicator, hideLoadingIndicator } from '../ui/loading-indicators.js';
import { displayPosts } from '../posts-manager.js';
import { steemConnection } from '../../auth/login-manager.js';
import { showToast } from '../ui/modals.js';

let lastPost = null;
let isLoading = false;
let hasMore = true;
let currentTag = null;

export async function loadPostsByTag(tag, options = {}) {
    if (tag === 'following') {
        // Non mostrare il messaggio "No posts found with tag"
        // e passa direttamente alla funzione specifica per i following
        await loadFollowingPosts(options);
        return;
    }

    if (isLoading) return;
    
    try {
        isLoading = true;
        if (!options.append) {
            showLoadingIndicator();
            const container = document.getElementById('posts-container');
            container.innerHTML = '<div class="loading-spinner"></div>';
        }

        const query = {
            tag: tag === 'all' ? 'photography' : tag, // default to photography if all is selected
            limit: 20,
            start_author: lastPost ? lastPost.author : undefined,
            start_permlink: lastPost ? lastPost.permlink : undefined
        };

        // Use getDiscussionsByCreated for better results
        const posts = await steem.api.getDiscussionsByCreatedAsync(query);
        
        // Solo per i tag normali, non per "following"
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

        if (filteredPosts.length === 0 && tag !== 'following') {
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

        await displayPosts(filteredPosts, 'posts-container', options.append);
        currentTag = tag;

    } catch (error) {
        console.error('Error loading posts by tag:', error);
        showToast('Error loading posts', 'error');
    } finally {
        isLoading = false;
        hideLoadingIndicator();
    }
}

async function loadFollowingPosts(options = {}) {
    if (!steemConnection.isConnected) {
        showToast('Please login to view posts from people you follow', 'warning');
        document.getElementById('posts-container').innerHTML = `
            <div class="no-posts-message">
                <i class="fas fa-lock"></i>
                <h3>Login Required</h3>
                <p>Please login to see posts from people you follow</p>
                <button id="login-prompt" class="connect-button">Connect to Steem</button>
            </div>`;
        
        document.getElementById('login-prompt')?.addEventListener('click', () => {
            showLoginModal();
        });
        return;
    }

    if (isLoading) return;
    isLoading = true;
    showLoadingIndicator();

    try {
        // Utilizziamo getFeedHistory per ottenere i post in ordine cronologico
        const query = {
            tag: steemConnection.username,
            limit: 20,
            start_author: options.append && lastPost ? lastPost.author : undefined,
            start_permlink: options.append && lastPost ? lastPost.permlink : undefined
        };

        // Utilizziamo getDiscussionsByFeed per ottenere il feed following
        const posts = await steem.api.getDiscussionsByFeedAsync(query);

        if (!posts || posts.length === 0) {
            if (!options.append) {
                document.getElementById('posts-container').innerHTML = `
                    <div class="no-posts-message">
                        <i class="fas fa-newspaper"></i>
                        <h3>No Posts Yet</h3>
                        <p>Follow some creators to see their posts here!</p>
                        <button onclick="window.location.hash='/search'" class="explore-button">
                            <i class="fas fa-compass"></i> Explore Profiles
                        </button>
                    </div>`;
            }
            hasMore = false;
            return;
        }

        // Aggiorna il riferimento all'ultimo post per la paginazione
        if (posts.length > 0) {
            lastPost = posts[posts.length - 1];
        }

        // Filtra i post duplicati e li ordina per data
        const uniquePosts = filterUniquePosts(posts)
            .sort((a, b) => new Date(b.created) - new Date(a.created));

        await displayPosts(uniquePosts, 'posts-container', options.append);
        
        // Imposta l'infinite scroll se non è già attivo
        setupFollowingScrollHandler();

    } catch (error) {
        console.error('Error loading following posts:', error);
        showToast('Error loading posts from followed accounts', 'error');
        if (!options.append) {
            document.getElementById('posts-container').innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Error Loading Posts</h3>
                    <p>Failed to load posts. Please try again.</p>
                    <button onclick="window.location.reload()" class="retry-button">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>`;
        }
    } finally {
        isLoading = false;
        hideLoadingIndicator();
    }
}

function filterUniquePosts(posts) {
    const seen = new Set();
    return posts.filter(post => {
        const key = `${post.author}_${post.permlink}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function setupFollowingScrollHandler() {
    if (window._followingScrollHandler) {
        window.removeEventListener('scroll', window._followingScrollHandler);
    }

    window._followingScrollHandler = () => {
        const scrollPosition = window.innerHeight + window.scrollY;
        const documentHeight = document.documentElement.scrollHeight;
        
        if (scrollPosition >= documentHeight - 1000) {
            loadFollowingPosts({ append: true });
        }
    };

    window.addEventListener('scroll', window._followingScrollHandler);
}

function setupTagScrollHandler(tag) {
    if (window._tagScrollHandler) {
        window.removeEventListener('scroll', window._tagScrollHandler);
    }

    window._tagScrollHandler = () => {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000) {
            loadPostsByTag(tag, { append: true });
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