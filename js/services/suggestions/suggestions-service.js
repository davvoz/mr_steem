import { SteemAPI } from '../common/api-wrapper.js';
import { steemConnection } from '../../auth/login-manager.js';
import { showFollowPopup } from '../ui/modals.js';

export async function loadSuggestions() {
    if (!steemConnection.isConnected) {
        console.log('No user connected, skipping suggestions');
        return;
    }

    try {
        const trending = await SteemAPI.getDiscussionsBy('trending', {
            tag: 'photography',
            limit: 5
        });

        const uniqueAuthors = [...new Set(trending.map(post => post.author))]
            .filter(author => author !== steemConnection.username)
            .slice(0, 5);

        const authorAccounts = await SteemAPI.getAccounts(uniqueAuthors);
        renderSuggestions(authorAccounts);

    } catch (error) {
        console.error('Failed to load suggestions:', error);
        handleSuggestionsError();
    }
}

export async function followUser(username) {
    if (!validateFollowPermissions()) return;

    try {
        const key = sessionStorage.getItem('steemPostingKey');
        await SteemAPI.follow(key, steemConnection.username, username);
        showFollowPopup(username);
        updateFollowButton(username);
    } catch (error) {
        console.error('Failed to follow user:', error);
        alert('Failed to follow user: ' + error.message);
    }
}

// Private helper functions
function validateFollowPermissions() {
    if (!steemConnection.isConnected || !steemConnection.username) {
        alert('Please connect to Steem first');
        return false;
    }
    return sessionStorage.getItem('steemPostingKey') !== null;
}

function renderSuggestions(accounts) {
    const container = document.getElementById('suggestions-container');
    if (!container) return;

    container.innerHTML = accounts.map(account => `
        <div class="suggestion">
            <img src="${account.profile_image}" alt="${account.name}" class="suggestion-avatar">
            <div class="suggestion-info">
                <h3>${account.name}</h3>
                <button onclick="followUser('${account.name}')">Follow</button>
            </div>
        </div>
    `).join('');
}

function handleSuggestionsError() {
    const container = document.getElementById('suggestions-container');
    if (container) {
        container.innerHTML = '<div class="error-message">Failed to load suggestions</div>';
    }
}

function updateFollowButton(username) {
    const btn = document.querySelector(`button[onclick="followUser('${username}')"]`);
    if (btn) {
        btn.textContent = 'Following';
        btn.disabled = true;
    }
}