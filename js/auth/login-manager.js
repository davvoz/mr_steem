import { loadSuggestions, updateSidebar } from '../services/posts-manager.js';
import { avatarCache } from '../utils/avatar-cache.js';

export const steemConnection = {
    isConnected: false,
    username: null
};

export function showLoginModal() {
    // Check if already logged in
    if (steemConnection.isConnected && steemConnection.username) {
        const confirmLogout = confirm(`You are already logged in as @${steemConnection.username}. Do you want to logout?`);
        if (confirmLogout) {
            // Logout user
            steemConnection.isConnected = false;
            steemConnection.username = null;
            sessionStorage.removeItem('steemPostingKey');
            
            // Clear any cached user data
            document.querySelector('.nav-profile-image img').src = 
                'https://material.io/resources/icons/static/icons/baseline-account_circle-24px.svg';
            
            // Reset profile image to default
            const navProfileImg = document.querySelector('.nav-profile-image img');
            if (navProfileImg) {
                navProfileImg.src = avatarCache.getDefaultAvatar();
                navProfileImg.alt = 'Profile';
            }
        }
        return;
    }

    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
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
            // Configure steem-js with the provided private posting key
            steem.api.setOptions({ url: 'https://api.steemit.com', useTestNet: false });
        }

        // Test connection by getting account info
        const accounts = await steem.api.getAccountsAsync([username]);
        if (accounts && accounts.length > 0) {
            steemConnection.isConnected = true;
            steemConnection.username = username;
            
            // Update visibility of profile/login buttons
            document.getElementById('profile-link').style.display = '';
            document.getElementById('login-link').style.display = 'none';
            
            // Salva i dati nel sessionStorage
            sessionStorage.setItem('steemUsername', username);
            if (key) {
                sessionStorage.setItem('steemPostingKey', key);
            }
            
            hideLoginModal();
            await updateProfileImage(accounts[0]);
            
            // Update UI to show connected state
                
            try {
                await loadSuggestions();
            } catch (suggestionError) {
                console.warn('Failed to load suggestions:', suggestionError);
                // Continue anyway as this is not critical
            }
            
            return true;
        } else {
            throw new Error('Account not found');
        }
    } catch (error) {
        console.error('Login failed:', error);
            return false;
    }
}

export function checkExistingLogin() {
    const username = sessionStorage.getItem('steemUsername');
    const profileLink = document.getElementById('profile-link');
    const loginLink = document.getElementById('login-link');
    
    if (username) {
        steemConnection.username = username;
        steemConnection.isConnected = true;
        
        // Show profile, hide login
        profileLink.style.display = '';
        loginLink.style.display = 'none';
        
        // Carica i dati dell'account per ottenere l'immagine del profilo
        steem.api.getAccountsAsync([username]).then(accounts => {
            if (accounts && accounts[0]) {
                updateProfileImage(accounts[0]);
            }
        });
        
        updateSidebar();
        loadSuggestions();
        
        return true;
    }

    // Show login, hide profile
    profileLink.style.display = 'none';
    loginLink.style.display = '';
    loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginModal();
    });

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