import { avatarCache } from '../utils/avatar-cache.js';
import { stopNotificationPolling } from '../services/notification-manager.js';
import { steemClient } from '../api/steem-client.js';

export const steemConnection = {
    username: null,
    isConnected: false,
    steem: null,
    postingKey: null,

    async connect(username, key = null) {
        try {
            const account = await steemClient.connect(username, key);
            this.username = username;
            this.isConnected = true;
            this.steem = steemClient.getSteem();
            this.postingKey = key;
            return account;
        } catch (error) {
            this.disconnect();
            throw error;
        }
    },

    disconnect() {
        this.username = null;
        this.isConnected = false;
        this.steem = null;
        this.postingKey = null;
        sessionStorage.removeItem('steemPostingKey');
    }
};

export function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        const usernameInput = document.getElementById('steemUsername');
        const keyInput = document.getElementById('steemKey');
        if (usernameInput) usernameInput.value = '';
        if (keyInput) keyInput.value = '';

        // Add close button if it doesn't exist
        if (!loginModal.querySelector('.close-button')) {
            const closeButton = document.createElement('button');
            closeButton.className = 'close-button';
            closeButton.innerHTML = '&times;';
            closeButton.style.cssText = `
                position: absolute;
                right: 10px;
                top: 10px;
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #666;
                padding: 5px 10px;
            `;
            closeButton.onclick = hideLoginModal;
            loginModal.appendChild(closeButton);
        }

        // Add click outside listener
        loginModal.onclick = (e) => {
            if (e.target === loginModal) {
                hideLoginModal();
            }
        };

        loginModal.style.display = 'flex';
    }
}

export function hideLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'none';
    }
}

export async function handleLogin(username, key = null) {
    try {
        if (!username) {
            throw new Error('Username is required');
        }

        await steemConnection.connect(username, key);
        steemConnection.username = username;
        steemConnection.isConnected = true;

        // Save login state
        localStorage.setItem('steemUsername', username);
        if (key) sessionStorage.setItem('steemPostingKey', key);

        // Close modal
        const modal = document.getElementById('loginModal');
        if (modal) modal.style.display = 'none';

        // Dispatch login success event
        window.dispatchEvent(new CustomEvent('loginSuccess'));
        
        // Redirect to profile page
        //window.location.hash = `/profile/${username}`;
        
        return true;
    } catch (error) {
        console.error('Login error:', error);
        steemConnection.isConnected = false;
        throw error;
    }
}

export function handleLogout() {
    steemConnection.isConnected = false;
    steemConnection.username = null;
    steemConnection.privateKey = null;

    sessionStorage.removeItem('steemUsername');
    sessionStorage.removeItem('steemPostingKey');

    stopNotificationPolling();

    window.dispatchEvent(new CustomEvent('logoutSuccess'));
    window.location.hash = '/';
}

export function checkExistingLogin() {
    const username = sessionStorage.getItem('steemUsername');
    if (username) {
        steemConnection.username = username;
        steemConnection.isConnected = true;
        return true;
    }
    return false;
}

export async function attemptSteemLogin() {
    if (typeof steem === 'undefined') {
        alert('Steem library not loaded');
        return;
    }
    const username = document.getElementById('steemUsername').value;
    const key = document.getElementById('steemKey').value || null;

    if (!username) {
        alert('Please enter a username');
        return;
    }

    try {
        const accounts = await steem.api.getAccountsAsync([username]);
        if (accounts && accounts.length > 0) {
            steemConnection.isConnected = true;
            steemConnection.username = username;
            if (key) {
                sessionStorage.setItem('steemPostingKey', key);
            }
            document.getElementById('loginModal').style.display = 'none';
            updateConnectionStatus(username);
            await initializeSteemContent();
            return true;
        }
        throw new Error('Account not found');
    } catch (error) {
        console.error('Login failed:', error);
        alert('Failed to connect: ' + error.message);
        return false;
    }
}

function updateConnectionStatus(username) {
   
}