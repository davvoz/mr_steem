import { steemConnection } from '../../auth/login-manager.js';
import { extractImageFromContent } from '../post/post-utils.js';
import { showLoadingIndicator, hideLoadingIndicator } from '../ui/loading-indicators.js';

export async function loadSteemPosts(options = {}) {
    showLoadingIndicator();
    try {
        const response = await steemConnection.getDiscussionsByCreated({ ...options, limit: 20 });
        const posts = await Promise.all(response.map(async post => {
            const [authorAccount] = await steem.api.getAccountsAsync([post.author]);
            return {
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
        }));
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
        const post = await steemConnection.getContent(author, permlink);
        return {
            author: post.author,
            permlink: post.permlink,
            title: post.title,
            body: post.body,
            image: extractImageFromContent(post.body)
        };
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
    // Implementation to reset the posts state
    // This could involve clearing cached posts, resetting UI elements, etc.
}