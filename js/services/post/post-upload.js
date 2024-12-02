
import { steemConnection } from '../../auth/login-manager.js';
import { SteemAPI } from '../common/api-wrapper.js';

export async function uploadPost(title, description, imageUrl) {
    const permlink = 'instaclone-' + Date.now();
    
    const operations = [
        ['comment', {
            parent_author: '',
            parent_permlink: 'instaclone',
            author: steemConnection.username,
            permlink: permlink,
            title: title,
            body: `${description}\n\n![Post Image](${imageUrl})\n\nPosted via InstaClone`,
            json_metadata: JSON.stringify({
                tags: ['instaclone', 'photo', 'social'],
                app: 'instaclone/1.0',
                image: [imageUrl]
            })
        }]
    ];

    const key = sessionStorage.getItem('steemPostingKey');
    if (!key) throw new Error('Posting key required');
    
    await SteemAPI.broadcast(operations, key);
}