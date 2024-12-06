
import { steemClient } from './steem-client.js';

export class PostService {
    async getPosts(tag = 'instaclone', limit = 20) {
        const query = { tag, limit };
        return await steem.api.getDiscussionsByCreatedAsync(query);
    }

    async createPost(title, description, imageUrl) {
        if (!steemClient.isConnected()) {
            throw new Error('Not connected to Steem');
        }

        const permlink = 'steemgram-' + Date.now();
        const operations = [
            ['comment', {
                parent_author: '',
                parent_permlink: 'steemgram',
                author: steemClient.getUsername(),
                permlink,
                title,
                body: this._formatPostBody(description, imageUrl),
                json_metadata: this._createPostMetadata(imageUrl)
            }]
        ];

        const key = sessionStorage.getItem('steemPostingKey');
        if (!key) throw new Error('Posting key required');

        return await steem.broadcast.sendAsync(
            { operations, extensions: [] },
            { posting: key }
        );
    }

    _formatPostBody(description, imageUrl) {
        return `
            ${description}
            ![Post Image](${imageUrl})
            Posted via SteemGram`;
                }

    _createPostMetadata(imageUrl) {
        return JSON.stringify({
            tags: ['steemgram', 'photo', 'social'],
            app: 'steemgram/1.0',
            image: [imageUrl]
        });
    }
}

export const postService = new PostService();