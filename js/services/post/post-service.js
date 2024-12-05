import { steemConnection } from '../../auth/login-manager.js';
import { SteemAPI } from '../common/api-wrapper.js';



export async function votePost(author, permlink, weight = 10000) {
    if (!validateVotePermissions()) return false;

    try {
        const key = sessionStorage.getItem('steemPostingKey');
        await SteemAPI.vote(key, steemConnection.username, author, permlink, weight);
        return true;
    } catch (error) {
        console.error('Failed to vote:', error);
        alert('Failed to vote: ' + error.message);
        return false;
    }
}



function validateVotePermissions() {
    if (!steemConnection.isConnected || !steemConnection.username) {
        alert('Please connect to Steem first');
        return false;
    }

    const key = sessionStorage.getItem('steemPostingKey');
    if (!key) {
        alert('Posting key required to vote');
        return false;
    }

    return true;
}



export function extractImageFromContent(post) {
    const imageRegex = /!\[.*?\]\((.*?)\)/;
    const match = post.body.match(imageRegex);
    return match ? match[1] : null;
}

export function cleanImageUrl(url) {
    return url.replace(/\\\//g, '/');
}


