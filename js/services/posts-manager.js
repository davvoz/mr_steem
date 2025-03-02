import { extractProfileImage, extractImageFromContent } from './posts/post-utils.js';
import { showLoadingIndicator, hideLoadingIndicator } from './ui/loading-indicators.js';
import { loadSteemPosts, loadSinglePost, votePost } from './posts/post-service.js';
import { showVotersModal } from './modals/voters-modal.js';
import { showCommentsModal } from './modals/comments-modal.js';
import { loadUserProfile } from './profile/profile-service.js';
import { updateSidebar } from './sidebar/sidebar-service.js';

const seenPosts = new Set();
const globalPostsCache = {
    home: new Map(),
    profile: new Map()
};


let lastPost = null;
let isLoading = false;
let hasMore = true;

const STEEM_API_URLS = [
    'https://api.moecki.online',
    'https://api.steemit.com',
    'https://api.steemitdev.com',
    'https://api.steemitstage.com',
    'https://api.justyy.com',
    'https://steemd.privex.io',
    'https://api.steem.house',
    'https://steemd.minnowsupportproject.org',
    'https://rpc.buildteam.io',
    'https://steemd.pevo.science'
];

let currentApiUrl = 0;

async function initSteemConnection() {
    while (currentApiUrl < STEEM_API_URLS.length) {
        try {
            steem.api.setOptions({ url: STEEM_API_URLS[currentApiUrl] });
            // Test the connection
            await steem.api.getDynamicGlobalPropertiesAsync();
            console.log('Connected to Steem API:', STEEM_API_URLS[currentApiUrl]);
            return true;
        } catch (error) {
            console.warn(`Failed to connect to ${STEEM_API_URLS[currentApiUrl]}, trying next...`);
            currentApiUrl++;
        }
    }
    throw new Error('Failed to connect to any Steem API endpoint');
}

export async function loadHomeFeed(append = false) {
    if (isLoading || !hasMore) return;

    try {
        isLoading = true;
        showLoadingIndicator();

        // Ensure Steem connection is initialized
        await initSteemConnection();

        const query = {
            tag: 'photography', // Default tag if not logged in
            limit: 20,
        };

        if (lastPost) {
            query.start_author = lastPost.author;
            query.start_permlink = lastPost.permlink;
        }

        // Use getDiscussionsByCreated instead of getDiscussionsByFeed for more reliable results
        const posts = await steem.api.getDiscussionsByCreatedAsync(query);

        if (!posts || posts.length === 0) {
            hasMore = false;
            return;
        }

        // Remove first post if this isn't the first load to avoid duplicates
        const postsToProcess = lastPost ? posts.slice(1) : posts;

        if (postsToProcess.length === 0) {
            hasMore = false;
            return;
        }

        // Update last post reference
        lastPost = posts[posts.length - 1];

        // Process and display posts
        await displayPosts(postsToProcess, 'posts-container', append);

        // Setup infinite scroll if not already set
        setupInfiniteScroll();

    } catch (error) {
        console.error('Error loading home feed:', error);
        // Try to reconnect using a different API endpoint
        currentApiUrl++;
        if (currentApiUrl < STEEM_API_URLS.length) {
            console.log('Attempting to reconnect with different API endpoint...');
            await loadHomeFeed(append);
        } else {
            document.getElementById('posts-container').innerHTML +=
                '<div class="error-message">Failed to load posts. <button onclick="window.location.reload()">Retry</button></div>';
        }
    } finally {
        isLoading = false;
        hideLoadingIndicator();
    }
}

function setupInfiniteScroll() {
    if (window._homeScrollHandler) return;

    window._homeScrollHandler = () => {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000) {
            loadHomeFeed(true);
        }
    };

    window.addEventListener('scroll', window._homeScrollHandler);
}

export function resetHomeFeed() {
    lastPost = null;
    isLoading = false;
    hasMore = true;
    seenPosts.clear();
    globalPostsCache.home.clear();

    if (window._homeScrollHandler) {
        window.removeEventListener('scroll', window._homeScrollHandler);
        window._homeScrollHandler = null;
    }

    const container = document.getElementById('posts-container');
    if (container) container.innerHTML = '';
}

export async function displayPosts(posts, containerId = 'posts-container', append = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const currentTag = getCurrentTagFromHash();
    const filteredPosts = filterPostsByTag(posts, currentTag);

    if (filteredPosts.length === 0) {
        displayNoPostsMessage(container, currentTag);
        return;
    }

    const postsHTML = await generatePostsHTML(filteredPosts);
    updateContainer(container, postsHTML, append);
}

function filterPostsByTag(posts, currentTag) {
    if (!currentTag || currentTag === 'following') {
        return posts;
    }

    return posts.filter(post => {
        try {
            const metadata = JSON.parse(post.json_metadata);
            return metadata.tags?.includes(currentTag);
        } catch (error) {
            console.warn('Failed to parse post metadata:', error);
            return false;
        }
    });
}

function displayNoPostsMessage(container, currentTag) {
    if (currentTag !== 'following') {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'no-posts-message';
        messageDiv.textContent = `No posts found ${currentTag ? `with tag #${currentTag}` : ''}`;
        container.replaceChildren(messageDiv);
    }
}

async function generatePostsHTML(posts) {
    const htmlParts = [];

    for (const post of posts) {
        if (post.author === 'udabeu') continue;

        try {
            const postData = await createPostData(post);
            const article = createPostElement(postData);
            //mettiamo l'evento onclick sull'articolo
            article.onclick = () => {
                window.location.hash = `#/post/${postData.author}/${postData.permlink}`;
            };
            htmlParts.push(article.outerHTML);
        } catch (error) {
            console.error(`Error processing post from ${post.author}:`, error);
        }
    }

    return htmlParts.join('');
}

async function createPostData(post) {
    const [authorAccount] = await steem.api.getAccountsAsync([post.author]);
    const postImage = extractImageFromContent(post);
    const authorImage = getAuthorImage(authorAccount);

    return {
        permlink: post.permlink,
        author: post.author,
        avatarUrl: authorImage || `https://steemitimages.com/u/${post.author}/avatar`,
        title: post.title || 'Untitled',
        image: postImage,
        stats: {
            likes: parseInt(post.active_votes?.length || 0, 10),
            comments: parseInt(post.children || 0, 10)
        }
    };
}

function createPostElement(postData) {
    const article = document.createElement('article');
    article.className = 'post';
    article.dataset.permlink = postData.permlink;
    article.dataset.author = postData.author;

    article.append(
        createPostHeader(postData),
        createPostContent(postData),
        createPostFooter(postData)
    );

    return article;
}

function createPostHeader(postData) {
    const header = document.createElement('header');
    header.className = 'post-header';

    const avatarContainer = createAvatarContainer(postData);
    const authorLink = createAuthorLink(postData);

    header.append(avatarContainer, authorLink);
    return header;
}

function createAvatarContainer(postData) {
    const container = document.createElement('div');
    container.className = 'author-avatar-container';

    const img = document.createElement('img');
    img.src = postData.avatarUrl;
    img.alt = postData.author;
    img.className = 'author-avatar';
    img.onerror = () => {
        img.src = `https://steemitimages.com/u/${postData.author}/avatar`;
    };

    container.appendChild(img);
    return container;
}

function createAuthorLink(postData) {
    const link = document.createElement('a');
    link.href = `#/profile/${postData.author}`;
    link.className = 'author-name';
    link.textContent = `@${postData.author}`;
    return link;
}

function createPostContent(postData) {
    const content = document.createElement('div');
    content.className = 'post-contento';
   
    const titleDiv = createTitleDiv(postData.title);
    const elements = postData.image ?
        [createImageContainer(postData.image), titleDiv] :
        [titleDiv];
    // su entrambi mettiamo l'evednto onclick
    for (const element of elements) {
        element.onclick = () => {
            window.location.hash = `#/post/${postData.author}/${postData.permlink}`;
        };
    }

    content.append(...elements);
    return content;
}

function createTitleDiv(title) {
    const div = document.createElement('div');
    div.className = 'post-title';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    div.appendChild(h3);
    return div;
}

function createImageContainer(imageUrl) {
    const container = document.createElement('div');
    container.className = 'post-image-container';
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Post content';
    img.onerror = () => container.style.display = 'none';
    container.appendChild(img);
    return container;
}

function createPostFooter(postData) {
    const footer = document.createElement('footer');
    footer.className = 'post-actions';
    footer.onclick = (e) => e.stopPropagation();

    const likesSpan = document.createElement('span');
    likesSpan.className = 'post-stat';
    likesSpan.textContent = `${postData.stats.likes} likes`;

    const commentsSpan = document.createElement('span');
    commentsSpan.className = 'post-stat';
    commentsSpan.textContent = `${postData.stats.comments} comments`;

    footer.append(likesSpan, commentsSpan);
    return footer;
}

function getAuthorImage(authorAccount) {
    try {
        return authorAccount ? extractProfileImage(authorAccount) : null;
    } catch (error) {
        console.warn('Failed to parse profile metadata:', error);
        return null;
    }
}

function updateContainer(container, html, append) {
    if (append) {
        container.insertAdjacentHTML('beforeend', html);
    } else {
        container.innerHTML = html;
    }
}

function getCurrentTagFromHash() {
    const match = window.location.hash.match(/#\/tag\/([^/]+)/);
    return match ? match[1] : null;
}

window.handleVote = async (author, permlink, button) => {
    //spinner
    //showLoadingIndicator();
    const success = await votePost(author, permlink);
    if (success) {
        // hideLoadingIndicator();
        button.classList.add('voted');
        button.disabled = true;
        const voteCount = parseInt(button.innerText.split(' ')[1]) + 1;
        button.innerHTML = `<i class="far fa-heart"></i> ${voteCount}`;
    }
};



export {
    loadSteemPosts,
    loadSinglePost,
    votePost,
    showVotersModal,
    showCommentsModal,
    loadUserProfile,
    updateSidebar
};
