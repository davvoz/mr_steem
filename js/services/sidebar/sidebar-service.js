import { steemConnection } from '../../auth/login-manager.js';
import { avatarCache } from '../../utils/avatar-cache.js';
import { extractProfileImage } from '../post/post-utils.js';
import { SteemAPI } from '../common/api-wrapper.js';
import { suggestionEvents } from '../suggestions/suggestions-service.js';

export function updateSidebar() {
    const userProfile = document.getElementById('user-profile');
    const loginSection = document.getElementById('login-section');
console.log('steemConnection.isConnected', steemConnection.isConnected);
    if (!userProfile) return;
    console.log('steemConnection.isConnected', steemConnection.isConnected);
    if (steemConnection.isConnected && steemConnection.username) {
        console.log('steemConnection.username', steemConnection.username);
        // Nascondi sezione login
        if (loginSection) {
            loginSection.style.display = 'none';
        }
        // Get profile image with fallback
        let profileImage = avatarCache.get(steemConnection.username);
        console.log('profileImage', profileImage);
        if (!profileImage) {
            console.log('Profile image not found in cache, fetching from Steem');
            try {
                profileImage = extractProfileImage(steemConnection.username);
                avatarCache.set(steemConnection.username, profileImage);
                console.log('Profile image loaded from Steem:', profileImage);
            } catch (error) {
                console.error('Failed to load profile image:', error);
                profileImage = '/images/default-avatar.png'; // Fallback image
                console.log('Profile image loaded from cache:', profileImage);
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
    if (!steemConnection.isConnected || !steemConnection.username) return;

    const suggestionsContainer = document.getElementById('suggestions');
    if (!suggestionsContainer) return;

    try {
        // Convert callback-style API to promises
        const getFollowing = () => new Promise((resolve, reject) => {
            steem.api.getFollowing(steemConnection.username, null, 'blog', 100, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        const getFollowers = () => new Promise((resolve, reject) => {
            steem.api.getFollowers(steemConnection.username, null, 'blog', 100, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // Get the lists
        const [following, followers] = await Promise.all([
            getFollowing(),
            getFollowers()
        ]);

        // Rest of the function remains the same
        const followingUsernames = following.map(user => user.following);
        const followerUsernames = followers.map(user => user.follower);

        // Find common users between followers and following
        const commonUsers = followerUsernames.filter(user => followingUsernames.includes(user));

        // Exclude users that the current user already follows
        const usersNotFollowed = commonUsers.filter(user => !followingUsernames.includes(user));

        // Get account details of these users
        const accounts = await SteemAPI.getAccounts(usersNotFollowed);

        // Exclude the current user
        const filteredAccounts = accounts.filter(account => account.name !== steemConnection.username);

        // Rank the users by the number of accounts they follow
        filteredAccounts.sort((a, b) => b.following_count - a.following_count);

        // Select top 3 users
        const topAccounts = filteredAccounts.slice(0, 3);

        // Render the suggestions
        renderSidebarSuggestions(topAccounts);

    } catch (error) {
        console.error('Failed to load suggestions:', error);
    }
}

function renderSidebarSuggestions(accounts) {
    const container = document.getElementById('suggestions');
    if (!container) return;

    accounts.forEach(account => {
        account.profile_image = extractProfileImage(account);
    });

    container.innerHTML = accounts.map(account => `
        <div class="suggestion">
            <img src="${account.profile_image}" alt="${account.name}" class="suggestion-avatar">
            <div class="suggestion-info">
                <h4>@${account.name}</h4>
                <button class="follow-button" data-username="${account.name}">Follow</button>
            </div>
        </div>
    `).join('');

    // Add click listeners using the imported followUser
    document.querySelectorAll('.follow-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const username = btn.dataset.username;
            followUser(username);
        });
    });
}

// Initialize the sidebar module
export function init() {
    suggestionEvents.addEventListener('userFollowed', (event) => {
        console.log('Sidebar received follow event:', event.detail);
        setTimeout(() => {
            loadSuggestions();
        }, 2000);
    });
    
    // Initial load
    loadSuggestions();
}

// Remove the separate followUser implementation and use the one from suggestions-service
export { followUser } from '../suggestions/suggestions-service.js';
