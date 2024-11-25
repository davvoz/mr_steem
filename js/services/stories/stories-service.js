import { steemConnection } from '../../auth/login-manager.js';
import { avatarCache } from '../../utils/avatar-cache.js';
import { SteemAPI } from '../common/api-wrapper.js';
import { extractImageFromContent } from '../post/post-utils.js';

export async function loadStories() {
    if (!steemConnection.isConnected || !steemConnection.username) {
        console.log('No user connected, skipping stories load');
        return;
    }

    try {
        const following = await SteemAPI.getFollowing(
            steemConnection.username,
            '',
            'blog',
            100
        );

        const followingAccounts = await SteemAPI.getAccounts(
            following.map(f => f.following)
        );

        await preloadAvatars(followingAccounts);
        renderStories(followingAccounts);

    } catch (error) {
        console.error('Failed to load stories:', error);
        const storiesContainer = document.getElementById('stories-container');
        if (storiesContainer) {
            storiesContainer.innerHTML = '<div class="error-message">Failed to load stories</div>';
        }
    }
}

function renderStories(accounts) {
    const container = document.getElementById('stories-container');
    if (!container) return;

    const storiesHtml = `
        <button class="story-scroll-button left">
            <i class="fas fa-chevron-left"></i>
        </button>
        <div class="stories">
            ${accounts.map(account => `
                <div class="story" data-username="${account.name}">
                    <div class="story-avatar">
                        <div class="story-avatar-inner">
                            <img src="${avatarCache.get(account.name)}" 
                                 alt="${account.name}"
                                 style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                        </div>
                    </div>
                    <span>${account.name}</span>
                </div>
            `).join('')}
        </div>
        <button class="story-scroll-button right">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    container.className = 'stories-container';
    container.innerHTML = storiesHtml;

    setupStoryScroll(container);
    setupStoryClickHandlers(container);
}

function setupStoryScroll(container) {
    const storiesDiv = container.querySelector('.stories');
    const leftBtn = container.querySelector('.story-scroll-button.left');
    const rightBtn = container.querySelector('.story-scroll-button.right');
    
    const updateButtonVisibility = () => {
        leftBtn.style.display = storiesDiv.scrollLeft > 0 ? 'flex' : 'none';
        rightBtn.style.display = 
            storiesDiv.scrollLeft < (storiesDiv.scrollWidth - storiesDiv.clientWidth - 10)
            ? 'flex' : 'none';
    };

    // Scroll amount for each click (show next set of stories)
    const scrollAmount = 300;

    leftBtn.addEventListener('click', () => {
        storiesDiv.scrollBy({
            left: -scrollAmount,
            behavior: 'smooth'
        });
    });

    rightBtn.addEventListener('click', () => {
        storiesDiv.scrollBy({
            left: scrollAmount,
            behavior: 'smooth'
        });
    });

    // Update button visibility on scroll and resize
    storiesDiv.addEventListener('scroll', updateButtonVisibility);
    window.addEventListener('resize', updateButtonVisibility);

    // Initial check
    updateButtonVisibility();
}

function setupStoryClickHandlers(container) {
    const storyElements = container.querySelectorAll('.story');
    storyElements.forEach(storyElement => {
        const username = storyElement.dataset.username;
        if (username) {
            storyElement.addEventListener('click', () => viewStory(username));
        }
    });
}

async function viewStory(username) {
    try {
        const posts = await SteemAPI.getDiscussionsBy('blog', {
            tag: username,
            limit: 1,
            truncate_body: 1000
        });

        if (!posts || posts.length === 0) {
            throw new Error('No recent posts found');
        }

        const post = posts[0];
        const imageUrl = extractImageFromContent(post)?.image?.[0] || '';
        renderStoryModal(username, post, imageUrl);

    } catch (error) {
        console.error('Failed to load user story:', error);
        showErrorModal(error);
    }
}

function renderStoryModal(username, post, imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'story-modal';
    modal.innerHTML = `
        <div class="story-content">
            <div class="story-header">
                <img src="${avatarCache.get(username)}" alt="${username}">
                <span>@${username}</span>
                <div class="story-timestamp">
                    ${new Date(post.created).toLocaleString()}
                </div>
                <button class="close-story">&times;</button>
            </div>
            <div class="story-body">
                ${imageUrl ? `
                    <div class="story-image">
                        <img src="${imageUrl}" alt="Post image">
                    </div>
                ` : ''}
                <h3>${post.title}</h3>
                <p>${post.body.substring(0, 280)}${post.body.length > 280 ? '...' : ''}</p>
                <a href="#/post/${post.author}/${post.permlink}" class="view-full-post">
                    View Full Post
                </a>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add click handler for the view full post link
    modal.querySelector('.view-full-post').addEventListener('click', () => {
        modal.remove(); // Close the modal when navigating to full post
    });

    // Close on click outside or on close button
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('close-story')) {
            modal.remove();
        }
    });

    // Close on escape key
    document.addEventListener('keydown', function closeOnEscape(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', closeOnEscape);
        }
    });
}

function showErrorModal(error) {
    const errorMessage = error.message === 'No recent posts found'
        ? 'This user has no recent posts to show.'
        : 'Failed to load story. Please try again later.';

    const errorModal = document.createElement('div');
    errorModal.className = 'story-modal error';
    errorModal.innerHTML = `
        <div class="story-content error">
            <h3>Oops!</h3>
            <p>${errorMessage}</p>
            <button onclick="this.closest('.story-modal').remove()">Close</button>
        </div>
    `;
    document.body.appendChild(errorModal);
}

async function preloadAvatars(accounts) {
    for (const account of accounts) {
        if (!avatarCache.has(account.name)) {
            const profileImage = extractProfileImage(account) ||
                `https://steemitimages.com/u/${account.name}/avatar/small`;
            avatarCache.set(account.name, profileImage);
        }
    }
}
function extractProfileImage(account) {
    if (account.json_metadata) {
        try {
            const metadata = JSON.parse(account.json_metadata);
            return metadata.profile?.profile_image || '';
        } catch (e) {
            console.error('Failed to parse JSON metadata for', account.name);
        }
    }
    return '';
}