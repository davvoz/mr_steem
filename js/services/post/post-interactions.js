
import { SteemAPI } from '../common/api-wrapper.js';
import { showVotersModal, showCommentsModal } from '../ui/modals.js';

export function setupPostInteractions(post) {
    const votesElement = document.querySelector('.net_votes');
    const commentsElement = document.querySelector('.comments-count');
    
    if (votesElement) {
        votesElement.addEventListener('click', async () => {
            const votes = await SteemAPI.getActiveVotes(post.author, post.permlink);
            showVotersModal(votes);
        });
    }

    if (commentsElement) {
        commentsElement.addEventListener('click', async () => {
            const replies = await SteemAPI.getContentReplies(post.author, post.permlink);
            showCommentsModal(replies);
        });
    }
}