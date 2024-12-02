import { extractImageFromContent } from '../post/post-utils.js';
import { EventBus } from '../common/event-bus.js';
import { votePost } from '../post/post-service.js';  // Aggiungi questa importazione

// Keep both module exports and window globals
export function showVotersModal(votes) {
    // Ensure votes is an array
    const votesArray = Array.isArray(votes) ? votes : [];
    
    const modal = createBaseModal('voters-modal');
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Likes ${votesArray.length > 0 ? `(${votesArray.length})` : ''}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${renderVotersList(votesArray)}
            </div>
        </div>
    `;

    showModal(modal);
}

export function showCommentsModal(comments) {
    // Ensure comments is an array
    const commentsArray = Array.isArray(comments) ? comments : [];
    
    const modal = createBaseModal('comments-modal');
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Comments ${commentsArray.length > 0 ? `(${commentsArray.length})` : ''}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${renderCommentsList(commentsArray)}
            </div>
        </div>
    `;

    showModal(modal);
    setupCommentImages(modal);
}

export function showFollowPopup(username) {
    const popup = document.createElement('div');
    popup.className = 'follow-popup';
    popup.innerHTML = `
        <div class="follow-popup-content">
            <i class="fas fa-check-circle"></i>
            <p>You are now following @${username}</p>
        </div>
    `;

    document.body.appendChild(popup);
    requestAnimationFrame(() => popup.classList.add('active'));

    setTimeout(() => {
        popup.classList.remove('active');
        setTimeout(() => popup.remove(), 300);
    }, 2000);
}

export function showPayoutModal(payoutDetails) {
    const modal = createBaseModal('payout-modal');
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Payout Details</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="payout-details">
                    <div class="payout-item">
                        <span class="label">Pending Payout:</span>
                        <span class="value">${payoutDetails.pendingPayout}</span>
                    </div>
                    <div class="payout-item">
                        <span class="label">Payout Date:</span>
                        <span class="value">${payoutDetails.payoutDate}</span>
                    </div>
                    <div class="payout-item">
                        <span class="label">Author Payout:</span>
                        <span class="value">${payoutDetails.totalPayout}</span>
                    </div>
                    <div class="payout-item">
                        <span class="label">Curator Payout:</span>
                        <span class="value">${payoutDetails.curatorPayout}</span>
                    </div>
                    ${payoutDetails.isPayoutDeclined ? 
                        '<div class="payout-declined">Payout declined by author</div>' : ''}
                    ${payoutDetails.beneficiaries.length > 0 ? `
                        <div class="beneficiaries">
                            <h4>Beneficiaries:</h4>
                            ${payoutDetails.beneficiaries.map(b => `
                                <div class="beneficiary-item">
                                    <span>@${b.account}</span>
                                    <span>${b.weight/100}%</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    showModal(modal);
}

// Aggiungi questa funzione per il toast
export function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span>${message}</span>
        </div>
    `;

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('active'));

    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function showVoteModal({ author, permlink, button }) {
    const modal = createBaseModal('vote-modal');
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Vote Post</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="vote-slider-container">
                    <input type="range" 
                           min="1" 
                           max="100" 
                           value="100" 
                           class="vote-slider" 
                           id="voteSlider">
                    <div class="vote-value">
                        <span id="votePercent">100</span>%
                    </div>
                </div>
                <button class="vote-submit-btn">
                    <i class="far fa-heart"></i> Submit Vote
                </button>
            </div>
        </div>
    `;

    const slider = modal.querySelector('#voteSlider');
    const percentDisplay = modal.querySelector('#votePercent');
    const submitBtn = modal.querySelector('.vote-submit-btn');

    slider.addEventListener('input', () => {
        percentDisplay.textContent = slider.value;
    });

    submitBtn.addEventListener('click', async () => {
        try {
            submitBtn.disabled = true;
            const weight = slider.value * 100; // Convert to Steem format (0-10000)
            const success = await votePost(author, permlink, weight);
            
            if (success) {
                // Aggiorna il conteggio dei voti nel post
                const voteCountSpan = document.querySelector(`.net_votes[data-post-author="${author}"][data-post-permlink="${permlink}"]`);
                if (voteCountSpan) {
                    const currentCount = parseInt(voteCountSpan.textContent) || 0;
                    voteCountSpan.textContent = `${currentCount + 1} likes`;
                }
                
                // Aggiorna il pulsante di voto
                button.classList.add('voted');
                button.disabled = true;
                
                // Chiudi il modale
                modal.querySelector('.modal-close').click();
                
                // Mostra il toast
                showToast(`Successfully voted with ${slider.value}% power!`);
            }
        } catch (error) {
            console.error('Vote failed:', error);
            showToast(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
        }
    });

    showModal(modal);
}

// Rimuovi le assegnazioni window globali
// window.showVotersModal = showVotersModal;
// window.showCommentsModal = showCommentsModal;
// window.showFollowPopup = showFollowPopup;

// Aggiungi gli event listeners
EventBus.on('showVoters', showVotersModal);
EventBus.on('showComments', showCommentsModal);
EventBus.on('showFollowPopup', showFollowPopup);
EventBus.on('showPayout', showPayoutModal);
EventBus.on('showVoteModal', showVoteModal);

// Aggiungi EventBus handler per il toast
EventBus.on('showToast', ({ message, type }) => showToast(message, type));

// Private helper functions
function createBaseModal(className) {
    const modal = document.createElement('div');
    modal.className = `modal-base ${className}`;
    return modal;
}

function showModal(modal) {
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));
    setupModalClosing(modal);
}

function setupModalClosing(modal) {
    const close = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 200);
    };

    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });
    
    document.addEventListener('keydown', function escapeHandler(e) {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', escapeHandler);
        }
    });
}

function renderVotersList(votes) {
    if (!Array.isArray(votes) || votes.length === 0) {
        return '<div class="no-items">No likes yet</div>';
    }

    // Sort votes by percent in descending order
    const sortedVotes = [...votes].sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));

    return sortedVotes.map(vote => `
        <div class="voter-item">
            <div class="voter-info">
                <img src="https://steemitimages.com/u/${vote.voter}/avatar" 
                     alt="@${vote.voter}"
                     class="voter-avatar"
                     onerror="this.src='https://steemitimages.com/u/${vote.voter}/avatar'">
                <a href="#/profile/${vote.voter}" 
                   class="voter-name" 
                   onclick="this.closest('.modal-base').remove()">@${vote.voter}</a>
            </div>
            <span class="vote-weight">${(Math.abs(vote.percent) / 100).toFixed(2)}%</span>
        </div>
    `).join('');
}

function renderCommentsList(comments) {
    if (!Array.isArray(comments) || comments.length === 0) {
        return '<div class="no-items">No comments yet</div>';
    }

    return comments.map(comment => {
        const imageUrl = extractImageFromContent(comment);
        // Rimuovi le immagini dal testo del commento
        const cleanBody = comment.body.replace(/!\[.*?\]\((.*?)\)/g, '').trim();
        
        const parsedBody = marked.parse(cleanBody, {
            breaks: true,
            sanitize: true,
            gfm: true
        });

        return `
            <div class="comment-item">
                <div class="comment-header">
                    <img src="https://steemitimages.com/u/${comment.author}/avatar" 
                         alt="@${comment.author}"
                         class="comment-avatar"
                         onerror="this.src='https://steemitimages.com/u/${comment.author}/avatar'">
                    <div class="comment-info">
                        <a href="#/profile/${comment.author}" 
                           class="comment-author" 
                           onclick="this.closest('.modal-base').remove()">@${comment.author}</a>
                        <span class="comment-date">${new Date(comment.created).toLocaleString()}</span>
                    </div>
                </div>
                <div class="comment-content">
                    <div class="comment-text">${parsedBody}</div>
                    ${imageUrl ? `
                        <div class="comment-image-preview">
                            <img src="${imageUrl}" 
                                 alt="Comment image" 
                                 class="comment-image-thumbnail"
                                 onclick="window.open('${imageUrl}', '_blank')">
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function setupCommentImages(modal) {
    modal.querySelectorAll('.comment-image-container').forEach(container => {
        const img = container.querySelector('.comment-image');
        if (img) {
            setupImageExpansion(container, img, img.getAttribute('src'));
        }
    });
}

function setupImageExpansion(container, img, imageUrl) {
    let overlay = null;
    
    const expandImage = (event) => {
        event.preventDefault();
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'comment-image-overlay';
            document.body.appendChild(overlay);
        }
        
        const expandedImg = img.cloneNode(true);
        expandedImg.classList.add('expanded');
        expandedImg.classList.remove('comment-image-thumbnail');
        
        overlay.innerHTML = '';
        overlay.appendChild(expandedImg);
        overlay.classList.add('active');
        
        setupOverlayClosing(overlay);
    };

    // Add expand button and handlers
    addExpandButton(container, expandImage);
    img.addEventListener('click', expandImage);
}

function setupOverlayClosing(overlay) {
    const close = () => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.innerHTML = '', 200);
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('expanded')) {
            close();
        }
    });

    document.addEventListener('keydown', function closeOnEsc(e) {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', closeOnEsc);
        }
    });
}

function addExpandButton(container, expandHandler) {
    const titleBar = document.createElement('div');
    titleBar.className = 'comment-image-title';
    titleBar.innerHTML = `
        <span>Image</span>
        <button class="comment-image-expand" title="Expand image">
            <i class="fas fa-expand"></i>
        </button>
    `;
    
    container.appendChild(titleBar);
    titleBar.querySelector('.comment-image-expand').addEventListener('click', expandHandler);
}