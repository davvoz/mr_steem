import { steemConnection } from '../../auth/login-manager.js';
import { showProfileLoadingIndicator, hideProfileLoadingIndicator } from '../ui/loading-indicators.js';
import { SteemAPI } from '../common/api-wrapper.js';
import { extractProfileImage, extractImageFromContent } from '../post/post-utils.js';
import { setupInfiniteScroll } from '../ui/infinite-scroll.js';
let profileLastPost = null;
let isLoadingProfile = false;
let hasMoreProfilePosts = true;

export async function loadUserProfile(username) {
    // Ensure view is visible
    const profileView = document.getElementById('profile-view');
    if (!profileView) {
        console.error('Profile view not found');
        return;
    }
    profileView.style.display = 'block';

    resetProfileState(username);

    try {
        const [account] = await SteemAPI.getAccounts([username]);
        if (!account) throw new Error('Account not found');

        const followCount = await SteemAPI.getFollowCount(username);
        const profileImage = extractProfileImage(account);
        const isFollowing = await checkIfFollowing(username);
        
        renderProfile(account, followCount, profileImage, isFollowing);
        setupProfileTabs(username);
        await loadMoreProfilePosts(username, false);
        setupInfiniteScroll('profile');

    } catch (error) {
        console.error('Failed to load profile:', error);
        document.getElementById('profile-view').innerHTML =
            '<div class="error-message">Failed to load profile</div>';
    }
}

async function setupProfileTabs(username) {
    const tabs = document.querySelectorAll('.profile-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            const activeTab = document.querySelector('.profile-tab.active');
            if (activeTab) activeTab.classList.remove('active');
            tab.classList.add('active');

            const tabName = tab.getAttribute('data-tab');
            const tabContent = document.getElementById(`profile-${tabName}`);
            if (!tabContent) return;

            if (tabName === 'posts') {
                await loadMoreProfilePosts(username, false);
                setupInfiniteScroll('profile');
            } else {
                await loadMoreProfileBlog(username, false);
                setupInfiniteScroll('profile-blog');
            }

            const activeContent = document.querySelector('.profile-content .active');
            if (activeContent) activeContent.classList.remove('active');
            tabContent.classList.add('active');
        });
    });
}


export async function loadMoreProfilePosts(username, append = true) {
    if (isLoadingProfile || !hasMoreProfilePosts) return;

    try {
        isLoadingProfile = true;
        showProfileLoadingIndicator();

        const query = {
            tag: username,
            limit: 20,
            start_author: profileLastPost?.author || undefined,
            start_permlink: profileLastPost?.permlink || undefined
        };

        let posts = await SteemAPI.getDiscussionsBy('blog', query);

        if (profileLastPost) {
            // Remove the first post if it's the same as the last post from previous batch
            if (posts.length && posts[0].permlink === profileLastPost.permlink) {
                posts = posts.slice(1);
            }
        }

        if (!posts.length) {
            hasMoreProfilePosts = false;
            return;
        }

        // Generate postsHTML using the updated posts array
        const postsHTML = await generatePostsHTML(posts, username);
        updateProfileGrid(postsHTML, append);

        // Update profileLastPost to the last post of the current batch
        profileLastPost = posts[posts.length - 1];

    } catch (error) {
        console.error('Failed to load profile posts:', error);
        hasMoreProfilePosts = false;
    } finally {
        isLoadingProfile = false;
        hideProfileLoadingIndicator();
    }
}

async function checkIfFollowing(username) {
    if (!steemConnection.isConnected || !steemConnection.username) return false;
    
    const following = await SteemAPI.getFollowing(
        steemConnection.username, 
        username, 
        'blog', 
        1
    );
    return following.some(f => f.following === username);
}

export async function followUser(username) {
    if (!steemConnection.isConnected || !steemConnection.username) {
        alert('Please login first');
        return;
    }

    if (!steemConnection.steem) {
        console.error('Steem client not available');
        alert('Connection error. Please try logging in again.');
        return;
    }
    
    const followButton = document.querySelector('.follow-button');
    if (followButton) {
        followButton.disabled = true;
        followButton.textContent = 'Processing...';
    }
    
    try {
        const isAlreadyFollowing = await checkIfFollowing(username);
        if (isAlreadyFollowing) {
            throw new Error('Already following this user');
        }

        await SteemAPI.follow(
            steemConnection.postingKey,
            steemConnection.username,
            username
        );
        
        if (followButton) {
            followButton.disabled = false;
            followButton.classList.add('following');
            followButton.textContent = 'Following';
        }
    } catch (error) {
        console.error('Failed to follow user:', error);
        if (followButton) {
            followButton.disabled = false;
            followButton.textContent = 'Follow';
        }
        alert(error.message || 'Failed to follow user. Please try again.');
    }
}

function renderProfile(account, followCount, profileImage, isFollowing) {
    const profileView = document.getElementById('profile-view');
    if (!profileView) return;

    const isOwnProfile = steemConnection.username === account.name;
    //recupera l'immagine del profilo 
    profileView.innerHTML = `
        <div class="profile-header">
            <img src="${profileImage}" alt="${account.name}" class="profile-avatar">
            <div class="profile-info">
                <h2>@${account.name}</h2>
                ${renderFollowButton(account.name, isFollowing, isOwnProfile)}
                <div class="stats">
                    <span><strong>${account.post_count}</strong> posts</span>
                    <span><strong>${followCount.follower_count}</strong> followers</span>
                    <span><strong>${followCount.following_count}</strong> following</span>
                </div>
                <div class="profile-bio">
                    ${getBio(account)}
                </div>
            </div>
        </div>
        ${renderProfileTabs()}
    `;

    // Add event listener for follow button after rendering
    const followButton = profileView.querySelector('.follow-button');
    if (followButton) {
        followButton.addEventListener('click', () => {
            const username = followButton.getAttribute('data-username');
            if (username) followUser(username);
        });
    }
}

function renderFollowButton(username, isFollowing, isOwnProfile) {
    if (isOwnProfile) return '';
    
    return `
        <button class="follow-button ${isFollowing ? 'following' : ''}" 
                data-username="${username}"
                ${!steemConnection.isConnected ? 'disabled' : ''}>
            ${isFollowing ? 'Following' : 'Follow'}
        </button>
    `;
}

function getBio(account) {
    try {
        return account.json_metadata ? 
            JSON.parse(account.json_metadata)?.profile?.about || '' : 
            '';
    } catch (e) {
        console.warn('Failed to parse profile metadata');
        return '';
    }
}

function renderProfileTabs() {
    return `
        
        <div class="profile-content">
            <div id="profile-posts" class="active">
                <div class="user-posts-grid" id="profile-posts-grid"></div>
            </div>
            <div class="loading-indicator" style="display: none;">
                <div class="spinner"></div>
            </div>
        </div>
    `;
}


async function generatePostsHTML(posts, username) {
    const postPromises = posts.map(async post => {
        const imageUrl = extractImageFromContent(post);
        const authorAccount = await SteemAPI.getAccounts([post.author]);
        const profileImage = extractProfileImage(authorAccount[0]);
        const isOwnPost = steemConnection.username === post.author;

        return `
            <div class="user-post-item" data-author="${post.author}" data-permlink="${post.permlink}" onclick="window.location.hash='#/post/${post.author}/${post.permlink}'">
                ${imageUrl ? `<img src="${imageUrl}" alt="Post image">` : 
                          '<div class="no-image">No Image</div>'}
                <div class="post-overlay">
                    <span><i class="fas fa-heart"></i> ${post.active_votes.length}</span>
                    <span><i class="fas fa-comment"></i> ${post.children}</span>
                </div>
            </div>
        `;
    });

    return (await Promise.all(postPromises)).join('');
}

function updateProfileGrid(postsHTML, append) {
    const postsGrid = document.getElementById('profile-posts-grid');
    if (!postsGrid) return;

    if (append) {
        postsGrid.insertAdjacentHTML('beforeend', postsHTML);
    } else {
        postsGrid.innerHTML = postsHTML;
    }
}

function resetProfileState(username) {
    profileLastPost = null;
    isLoadingProfile = false;
    hasMoreProfilePosts = true;

    const postsGrid = document.getElementById('profile-posts-grid');
    const blogPosts = document.getElementById('profile-blog-posts');
    if (postsGrid) postsGrid.innerHTML = '';
    if (blogPosts) blogPosts.innerHTML = '';
}

// ... rest of profile related functions ...