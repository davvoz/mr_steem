import { setupModalClosing } from './modal-utils.js';
import { extractImageFromContent } from '../posts/post-utils.js';
import { EventBus } from '../common/event-bus.js';  // Aggiungi questa importazione

export function showCommentsModal(comments) {
    const modal = document.createElement('div');
    modal.className = 'modal-base comments-modal';
    
    const setupImageExpansion = (container, img, imageUrl) => {
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
            
            const closeOverlay = () => {
                overlay.classList.remove('active');
                setTimeout(() => overlay.innerHTML = '', 200);
            };
            
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target === expandedImg) {
                    closeOverlay();
                }
            });
            
            document.addEventListener('keydown', function closeOnEsc(e) {
                if (e.key === 'Escape') {
                    closeOverlay();
                    document.removeEventListener('keydown', closeOnEsc);
                }
            });
        };

        // Create title bar with the expand button
        const titleBar = document.createElement('div');
        titleBar.className = 'comment-image-title';
        titleBar.innerHTML = `
            <span>Image</span>
            <button class="comment-image-expand" title="Expand image">
                <i class="fas fa-expand"></i>
            </button>
        `;
        
        container.appendChild(titleBar);
        
        // Add click handlers
        img.addEventListener('click', expandImage);
        titleBar.querySelector('.comment-image-expand').addEventListener('click', expandImage);
    };

    function renderCommentActions(comment) {
        const hasVoted = comment.active_votes?.some(vote => 
            vote.voter === steemConnection?.username
        );

        return `
            <div class="comment-actions">
                <div class="comment-stats">
                    <span class="net_votes clickable" 
                          data-author="${comment.author}" 
                          data-permlink="${comment.permlink}">
                        <i class="far fa-heart"></i>
                        ${comment.active_votes?.length || 0} likes
                    </span>
                    <span class="comments-count clickable"
                          data-author="${comment.author}" 
                          data-permlink="${comment.permlink}">
                        <i class="far fa-comment"></i>
                        ${comment.children || 0} replies
                    </span>
                </div>
                <div class="comment-buttons">
                    <button class="vote-button ${hasVoted ? 'voted' : ''}"
                            data-author="${comment.author}"
                            data-permlink="${comment.permlink}"
                            ${hasVoted ? 'disabled' : ''}>
                        <i class="far fa-heart"></i>
                        <span class="vote-count">${comment.active_votes?.length || 0}</span>
                    </button>
                    <button class="reply-button"
                            data-author="${comment.author}"
                            data-permlink="${comment.permlink}">
                        <i class="far fa-comment"></i>
                        <span class="reply-count">${comment.children || 0}</span>
                    </button>
                </div>
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Comments ${comments.length > 0 ? `(${comments.length})` : ''}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${comments.length > 0 ? 
                    comments.map(comment => {
                        const imageUrl = extractImageFromContent(comment);
                        const parsedBody = marked.parse(comment.body, {
                            breaks: true,
                            sanitize: false,
                            gfm: true,
                            smartypants: true,
                            breaks: true
                        });

                        return `
                            <div class="comment-item" data-author="${comment.author}" data-permlink="${comment.permlink}">
                                <div class="comment-header">
                                    <img src="https://steemitimages.com/u/${comment.author}/avatar" 
                                         alt="@${comment.author}"
                                         class="comment-avatar"
                                         onerror="this.src='https://steemitimages.com/u/${comment.author}/avatar'">
                                    <div class="comment-content">
                                        <a href="#/profile/${comment.author}" class="comment-author">@${comment.author}</a>
                                        <div class="comment-text">${parsedBody}</div>
                                        ${imageUrl ? `
                                            <div class="comment-image-container">
                                                <img src="${imageUrl}" 
                                                     alt="Comment image" 
                                                     class="comment-image comment-image-thumbnail">
                                            </div>
                                        ` : ''}
                                        <div class="comment-meta">
                                            ${new Date(comment.created).toLocaleString()}
                                        </div>
                                        ${renderCommentActions(comment)}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('') :
                    '<div class="no-items">No comments yet</div>'
                }
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => {
        modal.classList.add('active');
        // Setup image expansion for all comment images
        modal.querySelectorAll('.comment-image-container').forEach(container => {
            const img = container.querySelector('.comment-image');
            const imageUrl = img.getAttribute('src');
            setupImageExpansion(container, img, imageUrl);
        });
    });

    setupModalClosing(modal);

    // Modifichiamo l'event listener della modal-body
    const modalBody = modal.querySelector('.modal-body');
    modalBody.addEventListener('click', async (e) => {
        // Gestione del click sul commento
        const commentItem = e.target.closest('.comment-item');
        if (commentItem) {
            // Verifica che il click non sia su elementi interattivi
            const isOnButton = e.target.closest('button');
            const isOnLink = e.target.closest('a');
            const isOnActionArea = e.target.closest('.comment-actions');
            
            if (!isOnButton && !isOnLink && !isOnActionArea) {
                const { author, permlink } = commentItem.dataset;
                if (author && permlink) {
                    try {
                        const [comment, replies] = await Promise.all([
                            steem.api.getContentAsync(author, permlink),
                            steem.api.getContentRepliesAsync(author, permlink)
                        ]);

                        const commentModal = document.createElement('div');
                        commentModal.className = 'modal-base comment-detail-modal';
                        commentModal.innerHTML = `
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h3>Comment</h3>
                                    <button class="modal-close">&times;</button>
                                </div>
                                <div class="modal-body">
                                    <div class="comment-detail">
                                        ${renderCommentHTML(comment)}
                                    </div>
                                    <div class="comment-replies">
                                        <h4>${replies.length} Replies</h4>
                                        ${replies.map(reply => renderCommentHTML(reply)).join('')}
                                    </div>
                                    <div class="comment-actions-area">
                                        <button class="reply-button" data-author="${author}" data-permlink="${permlink}">
                                            <i class="far fa-comment"></i> Reply
                                        </button>
                                        <button class="vote-button" data-author="${author}" data-permlink="${permlink}">
                                            <i class="far fa-heart"></i> Like
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;

                        document.body.appendChild(commentModal);
                        setupModalClosing(commentModal);

                        // Gestione dei click sui pulsanti
                        commentModal.querySelector('.reply-button').addEventListener('click', () => {
                            EventBus.emit('showCommentEditor', { 
                                author, 
                                permlink,
                                isReply: true 
                            });
                        });

                        commentModal.querySelector('.vote-button').addEventListener('click', () => {
                            EventBus.emit('showVoteModal', { 
                                author, 
                                permlink, 
                                isComment: true 
                            });
                        });

                        // Chiudi la modale originale
                        modal.querySelector('.modal-close').click();
                    } catch (error) {
                        console.error('Error loading comment details:', error);
                    }
                }
            }
        }
    });

    // Gli altri event listener per voti e risposte rimangono sul modal
    modal.addEventListener('click', async (e) => {
        // Click sui likes counter
        const votesSpan = e.target.closest('.net_votes');
        if (votesSpan) {
            const { author, permlink } = votesSpan.dataset;
            const votes = await steem.api.getActiveVotesAsync(author, permlink);
            EventBus.emit('showVoters', votes);
            return;
        }

        // Click sui comments counter
        const commentsSpan = e.target.closest('.comments-count');
        if (commentsSpan) {
            const { author, permlink } = commentsSpan.dataset;
            const replies = await steem.api.getContentRepliesAsync(author, permlink);
            EventBus.emit('showComments', replies);
            return;
        }

        // Click sul pulsante like
        const voteButton = e.target.closest('.vote-button');
        if (voteButton && !voteButton.disabled) {
            const { author, permlink } = voteButton.dataset;
            EventBus.emit('showVoteModal', { 
                author, 
                permlink,
                button: voteButton,
                isComment: true 
            });
            return;
        }

        // Click sul pulsante reply
        const replyButton = e.target.closest('.reply-button');
        if (replyButton) {
            const { author, permlink } = replyButton.dataset;
            EventBus.emit('showCommentEditor', { 
                author, 
                permlink,
                isReply: true 
            });
            return;
        }

        // Event handler per il click sui likes
        const likesCount = e.target.closest('.comment-likes');
        if (likesCount) {
            const author = likesCount.dataset.author;
            const permlink = likesCount.dataset.permlink;
            const votes = await SteemAPI.getActiveVotes(author, permlink);
            EventBus.emit('showVoters', votes);
        }

        // Event handler per il click sui replies
        const repliesCount = e.target.closest('.comment-replies');
        if (repliesCount) {
            const author = repliesCount.dataset.author;
            const permlink = repliesCount.dataset.permlink;
            const replies = await SteemAPI.getContentReplies(author, permlink);
            EventBus.emit('showComments', replies);
        }

        // Gestione del click sul commento
        const commentItem = e.target.closest('.comment-item');
        if (commentItem) {
            console.log('Comment item clicked:', commentItem.dataset); // Debug log
            
            // Verifica che il click non sia su elementi interattivi
            const isOnButton = e.target.closest('button');
            const isOnLink = e.target.closest('a');
            const isOnActionArea = e.target.closest('.comment-actions');
            
            if (!isOnButton && !isOnLink && !isOnActionArea) {
                const { author, permlink } = commentItem.dataset;
                console.log('Navigating to:', author, permlink); // Debug log
                
                if (author && permlink) {
                    modal.querySelector('.modal-close').click();
                    window.location.hash = `#/comment/${author}/${permlink}`;
                }
            }
        }
    });
}