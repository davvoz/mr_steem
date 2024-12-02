import { steemConnection } from '../auth/login-manager.js';
import { avatarCache } from '../utils/avatar-cache.js';

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

export function showVoters(author, permlink, element) {
    if (!element) {
        alert('Debug: Element not found for vote display');
        return;
    }

    alert('Debug: Adding click listener');

    element.addEventListener('click', async (e) => {
        alert('Debug: Click detected!');
        e.preventDefault();
        e.stopPropagation();
        
        try {
            alert('Debug: Fetching voters...');
            const modal = document.createElement('div');
            modal.className = 'likes-modal';
            modal.style.display = 'flex';
            modal.style.opacity = '0';
            
            const post = await steem.api.getContentAsync(author, permlink);
            if (!post) {
                alert('Debug: Post not found');
                throw new Error('Post not found');
            }

            const voters = post.active_votes.sort((a, b) => b.percent - a.percent);
            alert(`Debug: Found ${voters.length} voters`);
            console.log('Voters found:', voters.length); // Debug log

            modal.innerHTML = `
                <div class="likes-container">
                    <h2>
                        ${voters.length} likes
                        <span class="close-button">&times;</span>
                    </h2>
                    <div class="likes-list">
                        ${await Promise.all(voters.map(async voter => {
                            const avatarUrl = await getVoterAvatar(voter.voter);
                            return `
                                <div class="voter-item">
                                    <img src="${avatarUrl}" alt="${voter.voter}" class="voter-avatar">
                                    <div class="voter-info">
                                        <strong>@${voter.voter}</strong>
                                        <span>${(voter.percent / 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                            `;
                        })).then(items => items.join(''))}
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);

            // Forza un reflow per assicurare che la transizione funzioni
            modal.offsetHeight;
            modal.style.opacity = '1';

            // Gestione chiusura
            const closeModal = () => {
                modal.style.opacity = '0';
                setTimeout(() => modal.remove(), 200);
            };

            modal.querySelector('.close-button').addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });

            // Chiudi con ESC
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeModal();
            });

        } catch (error) {
            alert('Debug Error: ' + error.message);
            console.error('Error showing voters:', error);
            alert('Failed to load voters');
        }
    });
}

async function getVoterAvatar(username) {
    if (!avatarCache.has(username)) {
        avatarCache.set(username, `https://steemitimages.com/u/${username}/avatar`);
    }
    return avatarCache.get(username);
}