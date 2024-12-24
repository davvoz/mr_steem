import { stopNotificationPolling } from '../services/notification-manager.js';
import { steemClient } from '../api/steem-client.js';
import { KeychainLogin } from '../services/auth/keychain-service.js';
import { SteemLoginService } from '../services/auth/steemlogin-service.js';
import { showToast } from '../../js/services/ui/modals.js';
import { scrollManager } from '../utils/scroll-manager.js';

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
    // Disable scroll while modal is open
    scrollManager.disableScroll();
}

export function hideLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'none';
        // Re-enable scroll when modal closes
        scrollManager.enableScroll();
    }
}

export async function handleLogin(username, key = null, useKeychain = false, accessToken = null) {
    try {
        if (!username) {
            throw new Error('Username is required');
        }

        // Set connection state first
        steemConnection.username = username;
        steemConnection.isConnected = true;
        steemConnection.useKeychain = useKeychain;

        // Save login state
        localStorage.setItem('steemUsername', username);
        localStorage.setItem('loginMethod', accessToken ? 'steemlogin' : (useKeychain ? 'keychain' : 'manual'));
        
        if (accessToken) {
            sessionStorage.setItem('steemLoginAccessToken', accessToken);
        } else if (key && !useKeychain) {
            sessionStorage.setItem('steemPostingKey', key);
        }

        // Try to connect to Steem
        try {
            await steemConnection.connect(username, key);
        } catch (error) {
            console.warn('Steem connection warning:', error);
            // Continue anyway since we have valid credentials
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
    // Check for authorization code in URL
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
        try {
            const steemLoginService = new SteemLoginService();
            const loginData = await steemLoginService.handleCallback();
            
            if (loginData) {
                console.log('Processing SteemLogin callback:', loginData);
                await handleLogin(loginData.username, null, false, loginData.accessToken);
                showToast('Successfully logged in!', 'success');
                
                // Clean URL and redirect to home
                window.history.replaceState({}, document.title, '/mr_steem/');
                window.location.hash = '#/';
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

export async function handleManualLogin(username, postingKey) {
    try {
        // ...existing login logic...

        // After successful login
        const modal = document.querySelector('.login-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        // Reset scroll state
        scrollManager.resetScroll();
        
        // Force layout update
        window.scrollTo(0, 0);
        document.body.offsetHeight;
        
        return true;
    } catch (error) {
        console.error('Login failed:', error);
        return false;
    }
}