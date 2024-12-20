import { avatarCache } from '../utils/avatar-cache.js';
import { stopNotificationPolling } from '../services/notification-manager.js';
import { steemClient } from '../api/steem-client.js';
import { KeychainLogin } from '../services/auth/keychain-service.js';
import { SteemLoginService } from '../services/auth/steemlogin-service.js';

export const steemConnection = {
    username: null,
    isConnected: false,
    steem: null,
    postingKey: null,
    useKeychain: false,

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
        this.useKeychain = false;
        sessionStorage.removeItem('steemPostingKey');
    }
};

export function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (!loginModal) return;

    // Setup Keychain login
    const keychainLogin = document.getElementById('keychainLogin');
    if (keychainLogin) {
        keychainLogin.style.display = isKeychainAvailable() ? 'block' : 'none';
        keychainLogin.onclick = attemptKeychainLogin;
    }

    // Setup manual login
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        loginButton.onclick = attemptManualLogin;
    }

    // Reset form
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

export function hideLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'none';
    }
}

export async function handleLogin(username, key = null, useKeychain = false, accessToken = null) {
    try {
        if (!username) {
            throw new Error('Username is required');
        }

        // For SteemLogin, we don't need to verify the posting key
        const skipKeyCheck = !!accessToken;
        
        await steemConnection.connect(username, key);
        steemConnection.username = username;
        steemConnection.isConnected = true;
        steemConnection.useKeychain = useKeychain;

        if (accessToken) {
            sessionStorage.setItem('steemLoginAccessToken', accessToken);
            localStorage.setItem('loginMethod', 'steemlogin');
        } else {
            localStorage.setItem('loginMethod', useKeychain ? 'keychain' : 'manual');
        }

        localStorage.setItem('steemUsername', username);
        if (key && !useKeychain) {
            sessionStorage.setItem('steemPostingKey', key);
        }

        hideLoginModal();
        window.dispatchEvent(new CustomEvent('loginSuccess'));
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
    steemConnection.useKeychain = false;

    localStorage.removeItem('steemUsername');
    localStorage.removeItem('useKeychain');
    sessionStorage.removeItem('steemPostingKey');

    stopNotificationPolling();

    window.dispatchEvent(new CustomEvent('logoutSuccess'));
    window.location.hash = '/';
}

export function checkExistingLogin() {
    const username = localStorage.getItem('steemUsername');
    const useKeychain = localStorage.getItem('useKeychain') === 'true';

    if (username) {
        steemConnection.username = username;
        steemConnection.isConnected = true;
        steemConnection.useKeychain = useKeychain;
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

export function isKeychainAvailable() {
    return KeychainLogin.isSteemKeychainAvailable();
}

async function validateUsername(username) {
    if (!username) {
        throw new Error('Username is required');
    }
    const accounts = await steem.api.getAccountsAsync([username]);
    if (!accounts || accounts.length === 0) {
        throw new Error('Account not found');
    }
    return true;
}

export async function attemptManualLogin() {
    const username = document.getElementById('steemUsername').value.trim();
    const key = document.getElementById('steemKey').value.trim();

    try {
        await validateUsername(username);

        if (!key) {
            throw new Error('Private posting key is required for manual login');
        }

        const success = await handleLogin(username, key, false);
        if (success) {
            showToast('Successfully logged in!', 'success');
            hideLoginModal();
        }
        return success;
    } catch (error) {
        showToast(error.message, 'error');
        return false;
    }
}

export async function attemptKeychainLogin() {
    const username = document.getElementById('steemUsername').value.trim();

    if (!KeychainLogin.isSteemKeychainAvailable()) {
        showToast('Steem Keychain extension is not installed', 'error');
        return false;
    }

    try {
        await validateUsername(username);

        const result = await KeychainLogin.loginWithSteemKeychain(username, async (response) => {
            if (response.success) {
                try {
                    await handleLogin(response.data.username, null, true);
                    showToast('Successfully logged in with Keychain!', 'success');
                    hideLoginModal();
                } catch (error) {
                    showToast(error.message, 'error');
                }
            }
        });

        return result.success;
    } catch (error) {
        showToast(error.message, 'error');
        return false;
    }
}

export async function initializeLoginHandlers() {
    const steemLoginService = new SteemLoginService();
    
    // Check if we're returning from a SteemLogin redirect
    if (window.location.hash.includes('access_token')) {
        try {
            const loginData = await steemLoginService.handleCallback();
            if (loginData) {
                console.log('Processing SteemLogin callback:', loginData);
                await handleLogin(loginData.username, null, false, loginData.accessToken);
                showToast('Successfully logged in with SteemLogin!', 'success');
            }
        } catch (error) {
            console.error('SteemLogin callback error:', error);
            showToast('Login failed: ' + error.message, 'error');
        }
    }
}

export function attemptSteemLoginAuth() {
    try {
        const steemLoginService = new SteemLoginService();
        steemLoginService.initiateLogin();
    } catch (error) {
        alert(error.message);
    }
}