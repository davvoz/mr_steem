import { avatarCache } from '../utils/avatar-cache.js';

export const steemConnection = {
    isConnected: false,
    username: null
};

export function showLoginModal() {
    // Remove previous check for already logged in since we want to show the modal anyway
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        // Reset form fields
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
        if (!username) {
            throw new Error('Username is required');
        }

        if (typeof steem === 'undefined') {
            throw new Error('Steem library not loaded');
        }

        // Set default if no key provided
        if (!key) {
            steem.api.setOptions({ url: 'https://api.steemit.com' });
        } else {
            steem.api.setOptions({ url: 'https://api.steemit.com', useTestNet: false });
        }

        // Test connection by getting account info
        const accounts = await steem.api.getAccountsAsync([username]);
        if (accounts && accounts.length > 0) {
            steemConnection.isConnected = true;
            steemConnection.username = username;
            
            // Save data to sessionStorage
            sessionStorage.setItem('steemUsername', username);
            if (key) {
                sessionStorage.setItem('steemPostingKey', key);
            }
            
            // Update UI - Aggiungi l'aggiornamento del bottone logout
            const profileLink = document.getElementById('profile-link');
            const loginLink = document.getElementById('login-link');
            const logoutLink = document.getElementById('logout-link');
            
            if (profileLink) profileLink.style.display = '';
            if (loginLink) loginLink.style.display = 'none';
            if (logoutLink) logoutLink.style.display = ''; // Mostra il bottone logout
            
            hideLoginModal();
            await updateProfileImage(accounts[0]);
            
            // Emit a custom event instead of directly calling functions
            window.dispatchEvent(new CustomEvent('loginSuccess'));
            
            window.location.hash = 'profile';
            
            return true;
        }
        throw new Error('Account not found');
    } catch (error) {
        console.error('Login failed:', error);
        throw error;
    }
}

export function handleLogout() {
    steemConnection.isConnected = false;
    steemConnection.username = null;
    
    // Clear session storage
    sessionStorage.removeItem('steemUsername');
    sessionStorage.removeItem('steemPostingKey');
    
    // Update UI elements
    const profileLink = document.getElementById('profile-link');
    const loginLink = document.getElementById('login-link');
    const logoutLink = document.getElementById('logout-link');
    
    if (profileLink) profileLink.style.display = 'none';
    if (loginLink) {
        loginLink.style.display = '';
        // Ensure login link is clickable
        loginLink.replaceWith(loginLink.cloneNode(true));
        // Re-attach click listener to new element
        document.getElementById('login-link').addEventListener('click', (e) => {
            e.preventDefault();
            showLoginModal();
        });
    }
    if (logoutLink) logoutLink.style.display = 'none';
    
    // Reset profile image
    const navProfileImg = document.querySelector('.nav-profile-image img');
    if (navProfileImg) {
        navProfileImg.src = 'https://material.io/resources/icons/static/icons/baseline-account_circle-24px.svg';
        navProfileImg.alt = 'Profile';
    }
    
    // Reset login modal
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'none';
        const usernameInput = document.getElementById('steemUsername');
        const keyInput = document.getElementById('steemKey');
        if (usernameInput) usernameInput.value = '';
        if (keyInput) keyInput.value = '';
    }
    
    // Redirect to home
    window.location.hash = '/';
    
    // Dispatch logout event
    window.dispatchEvent(new CustomEvent('logoutSuccess'));
}

export function checkExistingLogin() {
    const username = sessionStorage.getItem('steemUsername');
    const profileLink = document.getElementById('profile-link');
    const loginLink = document.getElementById('login-link');
    const logoutLink = document.getElementById('logout-link');
    
    if (username) {
        steemConnection.username = username;
        steemConnection.isConnected = true;
        
        // Show profile and logout, hide login
        if (profileLink) profileLink.style.display = '';
        if (loginLink) loginLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = '';
        
        // Load account data for profile image
        steem.api.getAccountsAsync([username]).then(accounts => {
            if (accounts && accounts[0]) {
                updateProfileImage(accounts[0]);
            }
        });
        
        // Dispatch event for successful login restoration
        window.dispatchEvent(new CustomEvent('loginSuccess'));
        
        return true;
    }

    // Show login, hide profile and logout
    if (profileLink) profileLink.style.display = 'none';
    if (loginLink) {
        loginLink.style.display = '';
        // Rimuovi eventuali listener esistenti
        loginLink.replaceWith(loginLink.cloneNode(true));
        // Prendi il riferimento aggiornato dopo il clone
        const newLoginLink = document.getElementById('login-link');
        // Aggiungi il nuovo listener
        newLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            showLoginModal();
        });
    }
    if (logoutLink) logoutLink.style.display = 'none';

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
                
                // Se non troviamo l'immagine nel json_metadata, proviamo nel posting_json_metadata
                if (!profileImage && account.posting_json_metadata) {
                    const postingMetadata = JSON.parse(account.posting_json_metadata);
                    profileImage = postingMetadata?.profile?.profile_image;
                }
            } catch (e) {
                console.warn('Failed to parse account metadata');
            }
        }

        // Fallback all'avatar di Steemit se non troviamo un'immagine personalizzata
        profileImage = profileImage || `https://steemitimages.com/u/${account.name}/avatar`;
        
        // Aggiorna la cache e l'UI
        avatarCache.set(account.name, profileImage);
        
        // Aggiorna l'immagine nella navbar
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