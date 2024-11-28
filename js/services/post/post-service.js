import { steemConnection } from '../../auth/login-manager.js';
import { SteemAPI } from '../common/api-wrapper.js';
import { AppState } from '../../state/app-state.js';


let lastPostPermlink = null;
let lastPostAuthor = null;
const seenPosts = new Set();
let isLoading = false;
let hasMorePosts = true;


// Add error handling utility
function handleLoadError(error, context = '') {
    console.error(`Error loading ${context}:`, error);
    AppState.update({
        isLoading: false,
        errors: [...AppState.getState().errors, {
            message: `Failed to load ${context}`,
            error: error.message,
            timestamp: new Date()
        }]
    });
    throw error;
}

export async function loadSteemPosts(limit = 20) {
    try {
        AppState.update({ isLoading: true });

        const posts = await steem.api.getDiscussionsByTrendingAsync({ limit });

        if (!posts || !Array.isArray(posts)) {
            throw new Error('Invalid response from Steem API');
        }

        // Process posts and update state
        AppState.update({
            posts: new Map(posts.map(post => [post.id, post])),
            isLoading: false
        });

        return posts;
    } catch (error) {
        handleLoadError(error, 'posts');
    }
}

async function fetchPosts() {
    const query = {
        tag: 'photography',
        limit: 20,
        start_author: lastPostAuthor || undefined,
        start_permlink: lastPostPermlink || undefined
    };

    const posts = await SteemAPI.getDiscussionsBy('created', query);
    return filterUniquePosts(posts);
}

function filterUniquePosts(posts) {
    const uniquePosts = posts.filter(post => {
        const postKey = `${post.author}-${post.permlink}`;
        if (seenPosts.has(postKey)) return false;
        seenPosts.add(postKey);
        return true;
    });

    if (lastPostPermlink && uniquePosts.length > 0) {
        uniquePosts.shift();
    }

    if (uniquePosts.length > 0) {
        const lastPost = uniquePosts[uniquePosts.length - 1];
        lastPostAuthor = lastPost.author;
        lastPostPermlink = lastPost.permlink;
    }

    return uniquePosts;
}

export async function loadSinglePost(author, permlink) {
    try {
        // Mostra indicatore di caricamento
        document.getElementById('post-view').innerHTML = '<div class="loading-spinner"></div>';

        // Carica il post e l'account dell'autore in parallelo
        const [post, [authorAccount]] = await Promise.all([
            steem.api.getContentAsync(author, permlink),
            steem.api.getAccountsAsync([author])
        ]);

        if (!post || !post.author) throw new Error('Post not found');

        // Estrai immagine profilo autore
        const authorImage = authorAccount ? extractProfileImage(authorAccount) : null;
        const avatarUrl = authorImage || `https://images.hive.blog/u/${post.author}/avatar`;
        
        // Processa il contenuto markdown
        const htmlContent = marked.parse(post.body);
        
        // Estrai la prima immagine dal contenuto
        const mainImage = extractImageFromContent(post);
        
        // Formatta la data
        const postDate = new Date(post.created).toLocaleString();
        
        // Genera HTML del post completo
        const postHTML = `
            <article class="full-post">
                <header class="full-post-header">
                    <div class="author-info">
                        <img src="${avatarUrl}" alt="${post.author}" class="author-avatar">
                        <div>
                            <a href="#/profile/${post.author}" class="author-name">@${post.author}</a>
                            <span class="post-date">${postDate}</span>
                        </div>
                    </div>
                </header>
                
                <div class="full-post-content">
                    <h1 class="post-title">${post.title}</h1>
                    ${mainImage ? `
                        <div class="main-image">
                            <img src="${mainImage}" alt="Post main image">
                        </div>
                    ` : ''}
                    <div class="post-body">
                        ${htmlContent}
                    </div>
                </div>

                <footer class="full-post-footer">
                    <div class="post-stats">
                        <span class="votes">
                            <i class="far fa-heart"></i> ${post.active_votes.length} likes
                        </span>
                        <span class="comments">
                            <i class="far fa-comment"></i> ${post.children} comments
                        </span>
                        <span class="payout">
                            <i class="fas fa-dollar-sign"></i> ${parseFloat(post.pending_payout_value).toFixed(2)} pending payout
                        </span>
                    </div>
                    <div class="post-tags">
                        ${JSON.parse(post.json_metadata).tags?.map(tag => 
                            `<a href="#/tag/${tag}" class="tag">#${tag}</a>`
                        ).join(' ') || ''}
                    </div>
                </footer>
            </article>
        `;

        document.getElementById('post-view').innerHTML = postHTML;
        
        // Aggiorna il titolo della pagina
        document.title = `${post.title} - SteemGram`;

    } catch (error) {
        console.error('Failed to load post:', error);
        document.getElementById('post-view').innerHTML = `
            <div class="error-message">
                Failed to load post. <a href="#/">Return to home</a>
            </div>
        `;
    }
}

async function renderSinglePost(post, authorAccount) {
    const authorImage = authorAccount ? extractProfileImage(authorAccount) : null;
    const avatarUrl = authorImage || `https://steemitimages.com/u/${post.author}/avatar/small`;
    const htmlContent = generatePostHtml(post);
    const postDate = new Date(post.created).toLocaleString();

    const postView = document.getElementById('post-view');
    if (!postView) return;

    postView.innerHTML = `
        <article class="full-post">
            ${generatePostHeader(post, avatarUrl, postDate)}
            ${generatePostContent(post, htmlContent)}
            ${generatePostFooter(post)}
        </article>
    `;
}

export async function createNewPost(title, description, imageUrl) {
    if (!validatePostInput(title, description)) return;

    try {
        const permlink = 'instaclone-' + Date.now();
        const operations = generatePostOperations(title, description, imageUrl, permlink);

        await submitPost(operations);
        alert('Posted successfully to Steem!');
        await loadSteemPosts();
    } catch (error) {
        console.error('Failed to post:', error);
        alert('Failed to post: ' + error.message);
    }
}

export async function votePost(author, permlink, weight = 10000) {
    if (!validateVotePermissions()) return false;

    try {
        const key = sessionStorage.getItem('steemPostingKey');
        await SteemAPI.vote(key, steemConnection.username, author, permlink, weight);
        return true;
    } catch (error) {
        console.error('Failed to vote:', error);
        alert('Failed to vote: ' + error.message);
        return false;
    }
}

// Helper functions
function validatePostInput(title, description) {
    if (!steemConnection.isConnected || !steemConnection.username) {
        alert('Please connect to Steem first');
        return false;
    }
    return title && description;
}

function validateVotePermissions() {
    if (!steemConnection.isConnected || !steemConnection.username) {
        alert('Please connect to Steem first');
        return false;
    }

    const key = sessionStorage.getItem('steemPostingKey');
    if (!key) {
        alert('Posting key required to vote');
        return false;
    }

    return true;
}

function generatePostOperations(title, description, imageUrl, permlink) {
    return [
        ['comment', {
            parent_author: '',
            parent_permlink: 'instaclone',
            author: steemConnection.username,
            permlink: permlink,
            title: title,
            body: `${description}\n\n![Post Image](${imageUrl})\n\nPosted via InstaClone`,
            json_metadata: JSON.stringify({
                tags: ['instaclone', 'photo', 'social'],
                app: 'instaclone/1.0',
                image: [imageUrl]
            })
        }]
    ];
}

async function submitPost(operations) {
    const key = sessionStorage.getItem('steemPostingKey');
    if (!key) throw new Error('Posting key required');
    await SteemAPI.broadcast(operations, key);
}

// Export reset function for cleanup
export function resetPostsState() {
    lastPostPermlink = null;
    lastPostAuthor = null;
    isLoading = false;
    seenPosts.clear();
    hasMorePosts = true;
}

export function extractProfileImage(account) {
    try {
        const metadata = JSON.parse(account.json_metadata);
        return metadata.profile.profile_image;
    } catch (e) {
        return null;
    }
}

export function extractImageFromContent(post) {
    const imageRegex = /!\[.*?\]\((.*?)\)/;
    const match = post.body.match(imageRegex);
    return match ? match[1] : null;
}

export function cleanImageUrl(url) {
    return url.replace(/\\\//g, '/');
}

function generatePostHtml(post) {
    try {
        return marked.parse(post.body);
    } catch (error) {
        console.warn('Failed to parse markdown:', error);
        return post.body;
    }
}

function generatePostHeader(post, avatarUrl, postDate) {
    return `
        <header class="post-header">
            <div class="author-info">
                <img src="${avatarUrl}" 
                     alt="${post.author}" 
                     class="author-avatar"
                     onerror="this.src='https://steemitimages.com/u/${post.author}/avatar/small'">
                <div class="author-details">
                    <a href="#/profile/${post.author}" class="author-name">@${post.author}</a>
                    <span class="post-date">${postDate}</span>
                </div>
            </div>
        </header>
    `;
}

function generatePostContent(post, htmlContent) {
    const postImage = extractImageFromContent(post);
    return `
        <div class="post-content">
            ${postImage ? `
                <div class="post-main-image">
                    <img src="${postImage}" alt="Post main image">
                </div>
            ` : ''}
            <h1 class="post-title">${post.title}</h1>
            <div class="markdown-content">
                ${htmlContent}
            </div>
        </div>
    `;
}

function generatePostFooter(post) {
    const hasVoted = post.active_votes?.some(vote => 
        vote.voter === steemConnection?.username
    );
    
    return `
        <footer class="post-footer">
            <div class="post-stats">
                <span class="net_votes clickable" onclick="window.showVotersModal('${post.author}', '${post.permlink}')">
                    ${post.active_votes?.length || 0} likes
                </span>
                <span class="comments-count clickable" onclick="window.showCommentsModal('${post.author}', '${post.permlink}')">
                    ${post.children || 0} comments
                </span>
                <span class="payout-value">$${parseFloat(post.pending_payout_value || 0).toFixed(2)}</span>
            </div>
            <div class="post-actions">
                <button class="vote-button ${hasVoted ? 'voted' : ''}"
                        onclick="window.handleVote('${post.author}', '${post.permlink}', this)"
                        ${hasVoted ? 'disabled' : ''}>
                    <i class="far fa-heart"></i> Like
                </button>
            </div>
        </footer>
    `;
}

// Add marked library if not already included
if (typeof marked === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    document.head.appendChild(script);
}