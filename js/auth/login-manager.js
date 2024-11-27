import { avatarCache } from '../utils/avatar-cache.js';
import { stopNotificationPolling } from '../services/notification-manager.js';

export const steemConnection = {
    username: null,
    privateKey: null,
    isConnected: false,
    async connect(username, key) {
        // Simulate the connection logic
        if (!username || !key) {
            throw new Error('Invalid username or key');
        }
        // Assume connection is successful
        this.username = username;
        this.privateKey = key;
        this.isConnected = true;
    }
};

export function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        const usernameInput = document.getElementById('steemUsername');
        const keyInput = document.getElementById('steemKey');
        if (usernameInput) usernameInput.value = '';
        if (keyInput) keyInput.value = '';
        loginModal.style.display = 'flex';
    }
}

export function hideLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'none';
    }
}

export async function handleLogin(username, key) {
    try {
        if (!username || !key) {
            throw new Error('Username and key are required');
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
        window.location.hash = `/profile/${username}`;
        
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

async function updateProfileImage(account) {
    try {
        let profileImage = '';
        if (account.json_metadata) {
            try {
                const metadata = typeof account.json_metadata === 'string' 
                    ? JSON.parse(account.json_metadata) 
                    : account.json_metadata;
                profileImage = metadata?.profile?.profile_image;
                if (!profileImage && account.posting_json_metadata) {
                    const postingMetadata = JSON.parse(account.posting_json_metadata);
                    profileImage = postingMetadata?.profile?.profile_image;
                }
            } catch (e) {
                console.warn('Failed to parse account metadata');
            }
        }
        profileImage = profileImage || `https://steemitimages.com/u/${account.name}/avatar`;
        avatarCache.set(account.name, profileImage);
        const navProfileImg = document.querySelector('.nav-profile-image img');
        if (navProfileImg) {
            navProfileImg.src = profileImage;
            navProfileImg.alt = `@${account.name}`;
        }
    } catch (error) {
        console.warn('Failed to update profile image:', error);
    }
}

export async function attemptSteemLogin() {
    if (typeof steem === 'undefined') {
        alert('Steem library not loaded');
        return;
    }
    const username = document.getElementById('steemUsername').value;
    const key = document.getElementById('steemKey').value;

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