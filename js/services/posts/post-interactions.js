
import { EventBus } from '../common/event-bus.js';
import { votePost } from './post-service.js';

export function setupPostInteractions() {
    if (window._postInteractionsInitialized) return;
    window._postInteractionsInitialized = true;

    document.addEventListener('click', async (e) => {
        handleVoteClick(e);
        handlePayoutClick(e);
        handleVotersClick(e);
        handleCommentsClick(e);
    });
}

function handleVoteClick(e) {
    // ...existing code...
}

// ...existing handlers...