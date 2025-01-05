import { steemConnection } from '../../auth/login-manager.js';
import { showProfileLoadingIndicator, hideProfileLoadingIndicator } from '../ui/loading-indicators.js';
import { SteemAPI } from '../common/api-wrapper.js';
import { extractProfileImage, extractImageFromContent } from '../posts/post-utils.js';
import { setupInfiniteScroll, cleanupInfiniteScroll } from '../ui/infinite-scroll.js';  // Add cleanupInfiniteScroll import
let profileLastPost = null;
let isLoadingProfile = false;
let hasMoreProfilePosts = true;

let commentLastPermlink = null;
let isLoadingComments = false;
let hasMoreComments = true;

export async function loadUserProfile(username) {
    // Reset scroll position and state immediately
    window.scrollTo(0, 0);
    profileLastPost = null;
    isLoadingProfile = false;
    hasMoreProfilePosts = true;
    commentLastPermlink = null;
    isLoadingComments = false;
    hasMoreComments = true;

    // Ensure clean state
    cleanupInfiniteScroll();

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

        // Reset profile state before loading new profile
        resetProfileState(username);

        const followCount = await SteemAPI.getFollowCount(username);
        const profileImage = extractProfileImage(account);
        const isFollowing = await checkIfFollowing(username);

        renderProfile(account, followCount, profileImage, isFollowing);
        setupProfileTabs(username);

        // Ensure UI is ready before loading posts
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadMoreProfilePosts(username, false);
        setupInfiniteScroll(() => loadMoreProfilePosts(username, true));

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

            // Reset scroll and cleanup infinite scroll
            window.scrollTo(0, 0);
            cleanupInfiniteScroll();

            // Handle tab content loading
            if (tabName === 'posts') {
                await loadMoreProfilePosts(username, false);
                setupInfiniteScroll(() => loadMoreProfilePosts(username, true));
            } else if (tabName === 'comments') {
                await loadMoreComments(username, false);
                setupInfiniteScroll(() => loadMoreComments(username, true));
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

        // Se non è append, resetta lo stato
        if (!append) {
            profileLastPost = null;
            window.scrollTo(0, 0);
        }

        const query = {
            tag: username,
            limit: 20,
            start_author: profileLastPost?.author || undefined,
            start_permlink: profileLastPost?.permlink || undefined
        };

        // Se non è append, non usare i parametri start_author e start_permlink
        if (!append) {
            delete query.start_author;
            delete query.start_permlink;
        }

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

        // Update scroll position if needed
        if (!append) {
            window.scrollTo(0, 0);
        }

    } catch (error) {
        console.error('Failed to load profile posts:', error);
        hasMoreProfilePosts = false;
    } finally {
        isLoadingProfile = false;
        hideProfileLoadingIndicator();
    }
}

async function loadMoreComments(username, append = true) {
    if (isLoadingComments || !hasMoreComments) return;

    try {
        isLoadingComments = true;
        showProfileLoadingIndicator();

        if (!append) {
            commentLastPermlink = null;
            window.scrollTo(0, 0);
        }

        const limit = 20;
        const comments = await SteemAPI.getAuthorComments(username, commentLastPermlink, limit);

        if (!comments.length) {
            hasMoreComments = false;
            if (!append) {
                updateCommentsList('<div class="no-comments">No comments found</div>', false);
            }
            return;
        }

        // Filtriamo solo i veri commenti (escludendo i post)
        const userComments = comments.filter(comment => comment.parent_author !== '');

        if (!userComments.length) {
            if (!append) {
                updateCommentsList('<div class="no-comments">No comments found</div>', false);
            }
            hasMoreComments = false;
            return;
        }

        const commentsHTML = generateUserCommentsHTML(userComments);
        updateCommentsList(commentsHTML, append);

        // Aggiorniamo il last permlink dal commento più recente
        commentLastPermlink = comments[comments.length - 1].permlink;

    } catch (error) {
        console.error('Failed to load comments:', error);
        hasMoreComments = false;
    } finally {
        isLoadingComments = false;
        hideProfileLoadingIndicator();
    }
}

function generateUserCommentsHTML(comments) {
    return comments.map(comment => {
        const date = new Date(comment.created).toLocaleDateString();

        // Pulisci il testo del commento dal markdown delle immagini
        let cleanBody = comment.body
            .replace(/!\[.*?\]\(.*?\)/g, '') // Rimuove markdown immagini
            .replace(/\[.*?\]\(.*?\)/g, '') // Rimuove link markdown
            .replace(/<img[^>]*>/g, '') // Rimuove tag img HTML
            .replace(/https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)/gi, '') // Rimuove URL diretti di immagini
            .trim();

        // Tronca il testo pulito se necessario
        const commentBody = cleanBody.length > 150 ?
            `${cleanBody.substring(0, 150)}...` :
            cleanBody;

        const commentImage = extractImageFromContent(comment);

        return `
            <div class="comment-item" 
                onclick="window.location.hash='#/post/${comment.parent_author}/${comment.parent_permlink}'">
                <div class="comment-header">
                    <span>Reply to @${comment.parent_author}'s post</span>
                    <span class="comment-date">${date}</span>
                </div>
                <div class="comment-content">
                    ${commentImage ?
                `<div class="comment-image">
                            <img src="${commentImage}" alt="Comment image" loading="lazy">
                        </div>` : ''
            }
                    <p>${commentBody}</p>
                </div>
                <div class="comment-footer">
                    <span class="comment-stats">
                        <i class="fas fa-heart"></i> ${comment.net_votes || 0}
                        <i class="fas fa-dollar-sign ml-2"></i> ${parseFloat(comment.pending_payout_value).toFixed(2)}
                    </span>
                </div>
            </div>
        `;
    }).join('');
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
     <div class="tag-filter">
     <div class="tag-scroll">
            <button class="profile-tab tag-button active" data-tab="posts">Posts</button>
            <button class="profile-tab tag-button" data-tab="comments">Comments</button>
        </div>
        <div class="profile-content">
            <div id="profile-posts" class="active">
                <div class="user-posts-grid" id="profile-posts-grid"></div>
            </div>
            <div id="profile-comments" class="profile-tab-content">
                <div class="user-comments-list" id="profile-comments-list"></div>
            </div>
            <div class="loading-indicator" style="display: none;">
                <div class="spinner"></div>
            </div>
        </div>
    </div>
    `;
}

async function generatePostsHTML(posts) {
    const postPromises = posts.map(async post => {
        const imageUrl = extractImageFromContent(post);

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

function generateCommentsHTML(comments) {
    return comments.map(comment => `
        <div class="comment-item" onclick="window.location.hash='#/post/${comment.parent_author}/${comment.parent_permlink}'">
            <div class="comment-header">
                <span class="comment-date">${new Date(comment.created).toLocaleDateString()}</span>
                <span class="comment-votes"><i class="fas fa-heart"></i> ${comment.active_votes.length}</span>
            </div>
            <div class="comment-content">
                <p>${comment.body.length > 150 ? comment.body.substring(0, 150) + '...' : comment.body}</p>
            </div>
            <div class="comment-footer">
                <span>on @${comment.parent_author}'s post</span>
            </div>
        </div>
    `).join('');
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

function updateCommentsList(commentsHTML, append) {
    const commentsList = document.getElementById('profile-comments-list');
    if (!commentsList) return;

    if (append) {
        commentsList.insertAdjacentHTML('beforeend', commentsHTML);
    } else {
        commentsList.innerHTML = commentsHTML;
    }
}

function resetProfileState(username) {
    // Reset all state variables
    profileLastPost = null;
    commentLastPermlink = null;
    isLoadingProfile = false;
    isLoadingComments = false;
    hasMoreProfilePosts = true;
    hasMoreComments = true;

    // Clear containers and force reflow
    const postsGrid = document.getElementById('profile-posts-grid');
    if (postsGrid) {
        postsGrid.innerHTML = '';
        postsGrid.offsetHeight; // force reflow
    }
    const commentsList = document.getElementById('profile-comments-list');
    if (commentsList) {
        commentsList.innerHTML = '';
        commentsList.offsetHeight; // force reflow
    }
}
