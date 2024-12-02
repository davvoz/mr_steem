
import { setupModalClosing } from './modal-utils.js';

export function showVotersModal(votes) {
    const modal = document.createElement('div');
    modal.className = 'modal-base voters-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Likes ${votes.length > 0 ? `(${votes.length})` : ''}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${votes.length > 0 ? 
                    votes.map(vote => `
                        <div class="voter-item">
                            <div class="voter-info">
                                <img src="https://steemitimages.com/u/${vote.voter}/avatar" 
                                     alt="@${vote.voter}"
                                     class="voter-avatar"
                                     onerror="this.src='https://steemitimages.com/u/${vote.voter}/avatar'">
                                <a href="#/profile/${vote.voter}" class="voter-name" onclick="this.closest('.modal-base').remove()">@${vote.voter}</a>
                            </div>
                            <span class="vote-weight">${(vote.percent / 100).toFixed(0)}%</span>
                        </div>
                    `).join('') :
                    '<div class="no-items">No likes yet</div>'
                }
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));

    setupModalClosing(modal);
}