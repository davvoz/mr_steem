import { steemConnection } from '../../auth/login-manager.js';
import { extractImageFromContent } from './post-utils.js';
import { showLoadingIndicator, hideLoadingIndicator } from '../ui/loading-indicators.js';
import { fetchPosts } from '../post/post-service.js';
import { displayPosts } from '../../services/posts-manager.js';

let lastPost = null;
let isLoading = false;
let hasMore = true;
const seenPosts = new Set();

export async function loadSteemPosts(options = {}) {
    if (isLoading || !hasMore) return;
    
    showLoadingIndicator();
    try {
        const posts = await fetchPosts(options);
        await displayPosts(posts, 'posts-container', options.append);
        return posts;
    } catch (error) {
        console.error('Error loading posts:', error);
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

export async function loadSinglePost(author, permlink) {
    showLoadingIndicator();
    try {
        // Get post and author data
        const [post, [authorAccount]] = await Promise.all([
            steem.api.getContentAsync(author, permlink),
            steem.api.getAccountsAsync([author])
        ]);

        const processedPost = {
            author: post.author,
            permlink: post.permlink,
            title: post.title,
            body: post.body,
            image: extractImageFromContent(post.body),
            authorImage: authorAccount ? extractProfileImage(authorAccount) : null,
            created: post.created,
            active_votes: post.active_votes,
            children: post.children,
            pending_payout_value: post.pending_payout_value
        };

        // Use the same rendering function with slight modifications for single post view
        const postView = document.getElementById('post-view');
        if (postView) {
            postView.innerHTML = renderPostHTML(processedPost);
            // Add any additional single post view specific elements
            const fullContent = document.createElement('div');
            fullContent.className = 'full-post-content';
            fullContent.innerHTML = marked.parse(processedPost.body);
            postView.querySelector('.post-preview').appendChild(fullContent);
        }

        return processedPost;
    } catch (error) {
        console.error('Error loading single post:', error);
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

export async function votePost(author, permlink) {
    showLoadingIndicator();
    try {
        const response = await steemConnection.vote(author, permlink);
        return response;
    } catch (error) {
        console.error('Error voting post:', error);
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

export function resetPostsState() {
    lastPost = null;
    isLoading = false;
    hasMore = true;
    seenPosts.clear();
}

