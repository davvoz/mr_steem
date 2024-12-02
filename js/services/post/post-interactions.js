import { EventBus } from '../common/event-bus.js';

let isInitialized = false;

export function setupPostInteractions() {
    if (isInitialized) return;
    isInitialized = true;

    document.addEventListener('click', async (e) => {
        // Aggiungi handler per il voto
        const voteButton = e.target.closest('.vote-button');
        if (voteButton && !voteButton.disabled) {
            e.preventDefault();
            e.stopPropagation();
            
            const author = voteButton.dataset.author;
            const permlink = voteButton.dataset.permlink;
            
            if (author && permlink) {
                EventBus.emit('showVoteModal', { author, permlink, button: voteButton });
            }
        }

        // Aggiungi handler per il payout
        const payoutElement = e.target.closest('.payout-value');
        if (payoutElement) {
            e.preventDefault();
            e.stopPropagation();
            
            const author = payoutElement.dataset.postAuthor;
            const permlink = payoutElement.dataset.postPermlink;
            
            if (author && permlink) {
                try {
                    payoutElement.style.opacity = '0.5';
                    const post = await steem.api.getContentAsync(author, permlink);
                    EventBus.emit('showPayout', {
                        pendingPayout: post.pending_payout_value,
                        payoutDate: new Date(post.cashout_time).toLocaleString(),
                        totalPayout: post.total_payout_value,
                        curatorPayout: post.curator_payout_value,
                        isPayoutDeclined: post.max_accepted_payout === '0.000 SBD',
                        beneficiaries: post.beneficiaries || []
                    });
                } catch (error) {
                    console.error('Error fetching payout details:', error);
                } finally {
                    payoutElement.style.opacity = '1';
                }
            }
        }

        // Find the closest .net_votes element (handles clicks on child elements too)
        const votesElement = e.target.closest('.net_votes');
        if (votesElement) {
            e.preventDefault(); // Prevent any other handlers
            e.stopPropagation(); // Stop event bubbling

            const author = votesElement.dataset.postAuthor;
            const permlink = votesElement.dataset.postPermlink;
            
            if (author && permlink) {
                try {
                    // Show loading state
                    votesElement.style.opacity = '0.5';
                    
                    const fullPost = await steem.api.getContentAsync(author, permlink);
                    // Sort votes by percent before showing modal
                    const votes = fullPost.active_votes || [];
                    const sortedVotes = votes.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));
                    
                    EventBus.emit('showVoters', sortedVotes);
                } catch (error) {
                    console.error('Error fetching votes:', error);
                    EventBus.emit('showVoters', []);
                } finally {
                    // Reset loading state
                    votesElement.style.opacity = '1';
                }
            }
        }

        // Handle comments clicks
        if (e.target.classList.contains('comments-count')) {
            const author = e.target.dataset.postAuthor;
            const permlink = e.target.dataset.postPermlink;
            try {
                const replies = await steem.api.getContentRepliesAsync(author, permlink);
                EventBus.emit('showComments', replies || []);
            } catch (error) {
                console.error('Error fetching comments:', error);
                EventBus.emit('showComments', []);
            }
        }
    });
}

// Remove auto-initialization
// setupPostInteractions();