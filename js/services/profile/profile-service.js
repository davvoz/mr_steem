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

        const posts = await SteemAPI.getDiscussionsBy('blog', query);
        
        if (!handlePostsResponse(posts)) return;

        const postsHTML = await generatePostsHTML(posts, username);
        updateProfileGrid(postsHTML, append);

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

function renderProfile(account, followCount, profileImage, isFollowing) {
    const profileView = document.getElementById('profile-view');
    if (!profileView) return;

    const isOwnProfile = steemConnection.username === account.name;
    
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
}

function renderFollowButton(username, isFollowing, isOwnProfile) {
    if (isOwnProfile) return '';
    
    return `
        <button class="follow-button ${isFollowing ? 'following' : ''}" 
                onclick="window.followUser('${username}')"
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
        <div class="profile-tabs">
            <div class="profile-tab active" data-tab="posts">POSTS</div>
            <div class="profile-tab" data-tab="blog">BLOG</div>
        </div>
        <div class="profile-content">
            <div id="profile-posts" class="active">
                <div class="user-posts-grid" id="profile-posts-grid"></div>
            </div>
            <div id="profile-blog">
                <div class="posts" id="profile-blog-posts"></div>
            </div>
            <div class="loading-indicator" style="display: none;">
                <div class="spinner"></div>
            </div>
        </div>
    `;
}

function handlePostsResponse(posts) {
    if (!posts || posts.length === 0) {
        hasMoreProfilePosts = false;
        return false;
    }

    const postsToProcess = profileLastPost ? posts.slice(1) : posts;
    if (postsToProcess.length === 0) {
        hasMoreProfilePosts = false;
        return false;
    }

    profileLastPost = posts[posts.length - 1];
    return true;
}

async function generatePostsHTML(posts, username) {
    const postPromises = posts.map(async post => {
        const imageUrl = extractImageFromContent(post);
        const authorAccount = await SteemAPI.getAccounts([post.author]);
        const profileImage = extractProfileImage(authorAccount[0]);
        const isOwnPost = steemConnection.username === post.author;

        return `
            <div class="user-post-item" data-author="${post.author}" data-permlink="${post.permlink}">
                ${imageUrl ? `<img src="${imageUrl}" alt="Post image">` : 
                          '<div class="no-image">No Image</div>'}
                <div class="post-overlay">
                    <span><i class="fas fa-heart"></i> ${post.net_votes}</span>
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