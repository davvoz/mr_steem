
import { setupModalClosing } from './modal-utils.js';
import { extractImageFromContent } from '../post/post-utils.js';

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
                            // Add these options to better handle long URLs
                            smartypants: true,
                            breaks: true
                        }).replace(
                            // Replace long image URLs with a more compact display
                            /!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g, 
                            '<div class="comment-image-container">$&</div>'
                        );

                        return `
                            <div class="comment-item">
                                <img src="https://steemitimages.com/u/${comment.author}/avatar" 
                                     alt="@${comment.author}"
                                     class="comment-avatar"
                                     onerror="this.src='https://steemitimages.com/u/${comment.author}/avatar'">
                                <div class="comment-content">
                                    <a href="#/profile/${comment.author}" class="comment-author" onclick="this.closest('.modal-base').remove()">@${comment.author}</a>
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
}