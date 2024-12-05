import { SteemAPI } from '../common/api-wrapper.js';
import { steemConnection } from '../../auth/login-manager.js';
import { showFollowPopup } from '../ui/modals.js';
import { extractProfileImage } from '../posts/post-utils.js';

// Centralize the event system
export const suggestionEvents = new EventTarget();

export async function loadSuggestions() {
    if (!steemConnection.isConnected || !steemConnection.username) {
        console.log('No user connected, skipping suggestions');
        return;
    }

    try {
        // Get followers and following
        const [following, followers] = await Promise.all([
            getFollowing(),
            getFollowers()
        ]);

        const followingUsernames = following.map(user => user.following);
        const followerUsernames = followers.map(user => user.follower);

        // Get initial suggestions from common connections
        let suggestedUsers = followerUsernames.filter(user => 
            !followingUsernames.includes(user) && 
            user !== steemConnection.username
        );

        // If we need more suggestions, add active followers
        if (suggestedUsers.length < 3) {
            const activeFollowers = await new Promise((resolve, reject) => {
                steem.api.getDiscussionsByBlog({ tag: steemConnection.username, limit: 20 }, (err, result) => {
                    if (err) reject(err);
                    else resolve(result.map(post => post.author));
                });
            });
            
            suggestedUsers = [...new Set([
                ...suggestedUsers,
                ...activeFollowers.filter(user => 
                    !followingUsernames.includes(user) && 
                    user !== steemConnection.username
                )
            ])];
        }

        // If still need more, add trending photography users
        if (suggestedUsers.length < 3) {
            const trendingUsers = await new Promise((resolve, reject) => {
                steem.api.getDiscussionsByTrending({ tag: 'photography', limit: 20 }, (err, result) => {
                    if (err) reject(err);
                    else resolve(result.map(post => post.author));
                });
            });
            
            suggestedUsers = [...new Set([
                ...suggestedUsers,
                ...trendingUsers.filter(user => 
                    !followingUsernames.includes(user) && 
                    user !== steemConnection.username
                )
            ])];
        }

        // Get full account details
        const accounts = await new Promise((resolve, reject) => {
            steem.api.getAccounts(suggestedUsers.slice(0, 10), (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        // Sort by engagement score (following + followers count)
        const sortedAccounts = accounts.sort((a, b) => {
            const scoreA = parseInt(a.following_count) + parseInt(a.follower_count);
            const scoreB = parseInt(b.following_count) + parseInt(b.follower_count);
            return scoreB - scoreA;
        });

        // Take top 3
        const topAccounts = sortedAccounts.slice(0, 3);
        
        renderSuggestions(topAccounts);

    } catch (error) {
        console.error('Failed to load suggestions:', error);
        handleSuggestionsError();
    }
}

function getFollowing() {
    return new Promise((resolve, reject) => {
        steem.api.getFollowing(steemConnection.username, null, 'blog', 100, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

function getFollowers() {
    return new Promise((resolve, reject) => {
        steem.api.getFollowers(steemConnection.username, null, 'blog', 100, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
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
    
    accounts.forEach(account => {
        account.profile_image = extractProfileImage(account);
    });
    
    container.innerHTML = accounts.map(account => `
        <div class="suggestion">
            <img src="${account.profile_image}" alt="${account.name}" class="suggestion-avatar">
            <div class="suggestion-info">
                <h3>${account.name}</h3>
                <button class="follow-button" data-username="${account.name}">Follow</button>
            </div>
        </div>
    `).join('');

    // Update click handlers to use data attribute
    document.querySelectorAll('.follow-button').forEach(btn => {
        btn.addEventListener('click', () => {
            followUser(btn.dataset.username);
        });
    });
}

export async function followUser(username) {
    if (!validateFollowPermissions()) return;

    try {
        const key = sessionStorage.getItem('steemPostingKey');
        await SteemAPI.follow(key, steemConnection.username, username);
        showFollowPopup(username);
        
        // Dispatch event before updating UI
        suggestionEvents.dispatchEvent(new CustomEvent('userFollowed', {
            detail: { username }
        }));
        
        // Update all instances of follow buttons for this user
        updateAllFollowButtons(username);
        
        // Reload suggestions after a longer delay
        setTimeout(() => {
            loadSuggestions();
        }, 2000);
    } catch (error) {
        console.error('Failed to follow user:', error);
        alert('Failed to follow user: ' + error.message);
    }
}

function handleSuggestionsError() {
    const container = document.getElementById('suggestions-container');
    if (container) {
        container.innerHTML = '<div class="error-message">Failed to load suggestions</div>';
    }
}

function updateAllFollowButtons(username) {
    // Update all buttons for this user across the page
    document.querySelectorAll(`.follow-button[data-username="${username}"]`).forEach(btn => {
        btn.textContent = 'Following';
        btn.disabled = true;
    });
}

// Add event listener in the module
suggestionEvents.addEventListener('userFollowed', () => {
    setTimeout(loadSuggestions, 1500);
});