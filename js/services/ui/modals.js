
import { extractImageFromContent } from '../post/post-utils.js';

export function showVotersModal(votes) {
    const modal = createBaseModal('voters-modal');
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Likes ${votes.length > 0 ? `(${votes.length})` : ''}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${renderVotersList(votes)}
            </div>
        </div>
    `;

    showModal(modal);
}

export function showCommentsModal(comments) {
    const modal = createBaseModal('comments-modal');
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Comments ${comments.length > 0 ? `(${comments.length})` : ''}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${renderCommentsList(comments)}
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
    if (votes.length === 0) return '<div class="no-items">No likes yet</div>';

    return votes.map(vote => `
        <div class="voter-item">
            <div class="voter-info">
                <img src="https://steemitimages.com/u/${vote.voter}/avatar" 
                     alt="@${vote.voter}"
                     class="voter-avatar"
                     onerror="this.src='https://steemitimages.com/u/${vote.voter}/avatar/small'">
                <a href="#/profile/${vote.voter}" 
                   class="voter-name" 
                   onclick="this.closest('.modal-base').remove()">@${vote.voter}</a>
            </div>
            <span class="vote-weight">${(vote.percent / 100).toFixed(0)}%</span>
        </div>
    `).join('');
}

function renderCommentsList(comments) {
    if (comments.length === 0) return '<div class="no-items">No comments yet</div>';

    return comments.map(comment => {
        const imageUrl = extractImageFromContent(comment);
        const parsedBody = marked.parse(comment.body, {
            breaks: true,
            sanitize: false,
            gfm: true,
            smartypants: true
        }).replace(
            /!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g, 
            '<div class="comment-image-container">$&</div>'
        );

        return `
            <div class="comment-item">
                <img src="https://steemitimages.com/u/${comment.author}/avatar" 
                     alt="@${comment.author}"
                     class="comment-avatar"
                     onerror="this.src='https://steemitimages.com/u/${comment.author}/avatar/small'">
                <div class="comment-content">
                    <a href="#/profile/${comment.author}" 
                       class="comment-author" 
                       onclick="this.closest('.modal-base').remove()">@${comment.author}</a>
                    ${imageUrl ? `
                        <div class="comment-image-container">
                            <img src="${imageUrl}" 
                                 alt="Comment image" 
                                 class="comment-image comment-image-thumbnail">
                        </div>
                    ` : ''}
                    <div class="comment-text">${parsedBody}</div>
                    <div class="comment-meta">
                        ${new Date(comment.created).toLocaleString()}
                    </div>
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