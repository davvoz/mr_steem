
import { steemConnection } from '../../auth/login-manager.js';
import { avatarCache } from '../../utils/avatar-cache.js';
import { extractProfileImage } from '../post/post-utils.js';
export function updateSidebar() {
    const userProfile = document.getElementById('user-profile');
    const loginSection = document.getElementById('login-section');

    if (!userProfile) return;

    if (steemConnection.isConnected && steemConnection.username) {
        // Nascondi sezione login
        if (loginSection) {
            loginSection.style.display = 'none';
        }
        // Get profile image with fallback
        let profileImage = avatarCache.get(steemConnection.username);
        if (!profileImage) {
            try {
                profileImage = extractProfileImage(steemConnection.username);
                avatarCache.set(steemConnection.username, profileImage);
            } catch (error) {
                console.error('Failed to load profile image:', error);
                profileImage = '/images/default-avatar.png'; // Fallback image
            }
        }

        userProfile.innerHTML = `
            <div class="sidebar-profile">
                <img src="${profileImage}" alt="${steemConnection.username}" class="profile-avatar-mini">
                <div class="sidebar-profile-info">
                    <h4>@${steemConnection.username}</h4>
                </div>
            </div>
        `;
        userProfile.style.display = 'block';
    } else {
        // Mostra sezione login
        userProfile.innerHTML = `
            <div class="login-section" id="login-section">
                <h4>Connect to Steem</h4>
                <p>Login to follow creators, like photos, and view your profile.</p>
                <button id="connect-steem" class="connect-button">Connect to Steem</button>
            </div>
        `;

        const connectButton = document.getElementById('connect-steem');
        if (connectButton) {
            connectButton.addEventListener('click', () => {
                const { showLoginModal } = require('../../auth/login-manager.js');
                showLoginModal();
            });
        }
    }
}

export async function loadSuggestions() {
    const suggestions = document.getElementById('suggestions');
    if (!suggestions) return;

    const response = await fetch('https://api.steem.place/suggestions');
    const data = await response.json();


    //valorizza l'avatar con il nostro metodo extractProfileImage
    data.forEach(user => {
        user.avatar = extractProfileImage(user.username);
    });

    const suggestionsList = data.map(user => {
        return `
            <div class="suggestion">
                <img src="${user.avatar}" alt="${user.username}" 
                     style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                <div class="suggestion-info">
                    <h4>@${user.username}</h4>
                    <p>${user.bio}</p>
                </div>
            </div>
        `;

    }
    ).join('');

    suggestions.innerHTML = suggestionsList;

    const followButtons = suggestions.querySelectorAll('.follow-button');
    followButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const username = button.dataset.username;
            await followUser(username);
        });
    });
}
