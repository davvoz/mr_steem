
import { steemConnection } from '../auth/login-manager.js';

export async function checkIfVoted(author, permlink) {
    try {
        const activeVotes = await steem.api.getActiveVotesAsync(author, permlink);
        return activeVotes.some(vote => vote.voter === steemConnection.username);
    } catch (error) {
        console.error('Failed to check vote status:', error);
        return false;
    }
}

export async function votePost(author, permlink) {
    if (!steemConnection.isConnected || !steemConnection.username) {
        alert('Please connect to Steem first');
        return;
    }

    try {
        const key = sessionStorage.getItem('steemPostingKey');
        if (!key) {
            throw new Error('Posting key required');
        }

        const hasVoted = await checkIfVoted(author, permlink);
        await steem.broadcast.voteAsync(
            key,
            steemConnection.username,
            author,
            permlink,
            hasVoted ? 0 : 10000
        );

        return !hasVoted; // Returns true if vote was added, false if removed
    } catch (error) {
        console.error('Failed to vote:', error);
        throw error;
    }
}

export async function showVoters(author, permlink, element) {
    try {
        const activeVotes = await steem.api.getActiveVotesAsync(author, permlink);
        element.innerHTML = activeVotes.map(vote => `<span>${vote.voter}</span>`).join(', ');
    } catch (error) {
        console.error('Failed to load voters:', error);
        element.innerHTML = 'Error loading voters';
    }
}