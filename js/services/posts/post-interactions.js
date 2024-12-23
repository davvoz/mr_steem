import { repostContent } from './post-service.js';
import { showToast } from '../ui/modals.js';

function createRepostModal() {
    const modal = document.createElement('div');
    modal.className = 'repost-modal';
    modal.innerHTML = `
        <div class="repost-modal-content">
            <div class="repost-modal-header">
                <h3>Repost this content</h3>
                <button class="repost-modal-close">&times;</button>
            </div>
            <textarea class="repost-textarea" 
                      placeholder="Add your thoughts about this post (optional)..."
                      maxlength="500"></textarea>
            <div class="repost-modal-actions">
                <button class="repost-cancel">Cancel</button>
                <button class="repost-submit">Repost</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function showRepostModal(author, permlink, callback) {
    const modal = document.querySelector('.repost-modal') || createRepostModal();
    const textarea = modal.querySelector('.repost-textarea');
    
    modal.style.display = 'flex';
    textarea.value = '';
    textarea.focus();

    const closeModal = () => {
        modal.style.display = 'none';
        textarea.value = '';
    };

    // Event listeners
    modal.querySelector('.repost-modal-close').onclick = closeModal;
    modal.querySelector('.repost-cancel').onclick = closeModal;
    
    modal.querySelector('.repost-submit').onclick = async () => {
        const comment = textarea.value.trim();
        const success = await callback(comment);
        if (success) {
            closeModal();
        }
    };

    // Close when clicking outside
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };
}

async function handleRepostClick(e) {
    const repostButton = e.target.closest('.repost-button');
    if (!repostButton) return;

    const author = repostButton.dataset.author;
    const permlink = repostButton.dataset.permlink;

    if (!author || !permlink) {
        console.error('Missing author or permlink data attributes');
        showToast('Error: Cannot repost this content', 'error');
        return;
    }

    showRepostModal(author, permlink, async (comment) => {
        try {
            const success = await repostContent(author, permlink, comment);
            if (success) {
                repostButton.disabled = true;
                repostButton.classList.add('reposted');
                showToast('Post reposted successfully!', 'success');
            }
            return success;
        } catch (error) {
            console.error('Repost error:', error);
            showToast('Failed to repost: ' + error.message, 'error');
            return false;
        }
    });
}

export function setupRepostHandlers() {
    document.removeEventListener('click', handleRepostClick);
    document.addEventListener('click', handleRepostClick);
}
