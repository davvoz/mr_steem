import { steemConnection } from '../../auth/login-manager.js';
import { extractImageFromContent } from './post-utils.js';
import { showLoadingIndicator, hideLoadingIndicator } from '../ui/loading-indicators.js';
import { displayPosts } from '../../services/posts-manager.js';
import { extractProfileImage } from './post-utils.js';
import { SteemAPI } from '../common/api-wrapper.js';
let isLoading = false;
let hasMore = true;

export async function loadSteemPosts(options = {}) {
    if (isLoading || !hasMore) return;

    showLoadingIndicator();
    try {
        const posts = await fetchPosts(options);
        await displayPosts(posts, 'posts-container', options.append);
        return posts;
    } catch (error) {
        console.error('Error loading posts:', error);
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

export async function loadSinglePost(author, permlink) {
    showLoadingIndicator();
    try {
        // Get post and author data
        const [post, [authorAccount]] = await Promise.all([
            steem.api.getContentAsync(author, permlink),
            steem.api.getAccountsAsync([author])
        ]);
        
        const processedPost = {
            author: post.author,
            permlink: post.permlink,
            title: post.title,
            body: post.body,
            image: extractImageFromContent(post.body),
            authorImage: authorAccount ? extractProfileImage(authorAccount) : null,
            created: post.created,
            active_votes: post.active_votes,
            children: post.children,
            pending_payout_value: post.pending_payout_value,
            tags: post.json_metadata ? JSON.parse(post.json_metadata).tags : []
        };

        // Use the same rendering function with slight modifications for single post view
        const postView = document.getElementById('post-view');
        if (postView) {
            postView.innerHTML = renderPostHTML(processedPost);
        }

        return processedPost;
    } catch (error) {
        console.error('Error loading single post:', error);
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

function generatePostHeader(post, avatarUrl, postDate) {
    return `
        <header class="post-header-all">
        <h1 class="post-title" style="font-size: 2.6rem;font-weight: 300;">${post.title}</h1>
        <div class="post-header">
            <div class="author-info">
                <img src="${avatarUrl}" 
                     alt="${post.author}" 
                     class="author-avatar"
                     onerror="this.src='https://steemitimages.com/u/${post.author}/avatar'">
                <div class="author-details">
                    <a href="#/profile/${post.author}" class="author-name">@${post.author}</a>
                    <span class="post-date">${postDate}</span>
                </div>
            </div>
            </div>
        </header>
    `;
}

function generatePostContent(htmlContent) {
    // Convert markdown to HTML if the `marked` library is available
    let convertedHtml = typeof marked !== 'undefined' ? marked.parse(htmlContent) : htmlContent;
console.log(convertedHtml);
    // Process markdown-style image URLs to maintain PNG transparency
    convertedHtml = convertedHtml.replace(
        /!\[(.*?)\]\((.*?)\)/g,
        (match, alt, url) => {
            // Ensure the URL starts with "http" or "//"
            if (!url.match(/^https?:\/\//)) url = `https://${url}`;

            // Special handling for PNG files to preserve transparency
            if (url.match(/\.png$/i)) {
                return `<center><img src="${url}" 
                    alt="${alt}"
                    class="post-image"
                    loading="lazy" /></center>`;
            }

            // Use CDN for other formats
            const cdnUrl = `https://steemitimages.com/640x0/${url}`;
            const cdnUrlHD = `https://steemitimages.com/1280x0/${url}`;

            return `<center><img src="${cdnUrl}" 
                alt="${alt}" 
                srcset="${cdnUrl} 1x, ${cdnUrlHD} 2x"
                class="post-image"
                loading="lazy" /></center>`;
        }
    );

    // Process existing <img> tags to maintain PNG transparency
    convertedHtml = convertedHtml.replace(
        /<img[^>]+src="([^"]+)"[^>]*>/gi,
        (match, src) => {
            // Ensure the URL starts with "http" or "//"
            if (!src.match(/^https?:\/\//)) src = `https://${src}`;

            // Special handling for PNG files to preserve transparency
            if (src.match(/\.png$/i)) {
                return `<center><img src="${src}" 
                    class="post-image"
                    loading="lazy" /></center>`;
            }

            // Use CDN for other formats
            const cdnUrl = `https://steemitimages.com/640x0/${src}`;
            const cdnUrlHD = `https://steemitimages.com/1280x0/${src}`;

            return `<center><img src="${cdnUrl}" 
                srcset="${cdnUrl} 1x, ${cdnUrlHD} 2x"
                class="post-image"
                loading="lazy" /></center>`;
        }
    );

    // Process additional image URLs starting with http
    convertedHtml = convertedHtml.replace(
        /http:\/\/([^\s]+\.(png|jpg|jpeg|gif|webp))/gi,
        (match, url) => {
            const fullUrl = `http://${url}`;

            // Special handling for PNG files to preserve transparency
            if (fullUrl.match(/\.png$/i)) {
                return `<center><img src="${fullUrl}" 
                    class="post-image"
                    loading="lazy" /></center>`;
            }

            // Use CDN for other formats
            const cdnUrl = `https://steemitimages.com/640x0/${fullUrl}`;
            const cdnUrlHD = `https://steemitimages.com/1280x0/${fullUrl}`;

            return `<center><img src="${cdnUrl}" 
                srcset="${cdnUrl} 1x, ${cdnUrlHD} 2x"
                class="post-image"
                loading="lazy" /></center>`;
        }
    );
    convertedHtml = convertedHtml.replace(
        /<a[^>]+href="([^"]+\.(png|jpg|jpeg|gif|webp)(\?[^"]*)?)"[^>]*>(.*?)<\/a>/gi,
        (match, href, extension, queryString, innerText) => {
            // Decodifica entità HTML e pulizia dell'URL
            let originalUrl = href.replace(/&amp;/g, '&');
    
            // Costruzione del prefisso Steemit CDN
            let steemitBaseUrl = 'https://steemitimages.com';
            let steemitUrl = `${steemitBaseUrl}/640x0/${originalUrl}`;
            let steemitUrlHD = `${steemitBaseUrl}/1280x0/${originalUrl}`;
    
            // Generazione del tag `img` completo
            return `<img 
                src="${steemitUrl}" 
                srcset="${steemitUrl} 1x, ${steemitUrlHD} 2x" 
                alt="image" 
                style="width: 100%; max-width: 100%; height: auto;"
            />`;
        }
    );
    
    
    // Wrap the processed HTML in a container
    return `<div class="post-content">
        <div class="post-body markdown-content">${convertedHtml}</div>
    </div>`;
}

function generatePostFooter(post) {
    const hasVoted = post.active_votes?.some(vote =>
        vote.voter === steemConnection?.username
    );

    let tags = post.tags || [];


    return `
        <footer class="post-footer">
            <div class="post-stats">
                <span class="net_votes clickable" 
                      data-post-author="${post.author}" 
                      data-post-permlink="${post.permlink}"
                      style="cursor: pointer;">
                    <i class="far fa-heart"></i>
                    ${post.active_votes?.length || 0} likes
                </span>
                <span class="comments-count"
                      data-post-author="${post.author}" 
                      data-post-permlink="${post.permlink}"
                      style="cursor: pointer;">
                    <i class="far fa-comment"></i>
                    ${post.children || 0} comments
                </span>
                <span class="payout-value clickable"
                      data-post-author="${post.author}" 
                      data-post-permlink="${post.permlink}"
                      style="cursor: pointer;">
                    <i class="fas fa-dollar-sign"></i>
                    ${parseFloat(post.pending_payout_value || 0).toFixed(2)}
                </span>
            </div>
            <div class="post-tags">
                ${tags.map(tag => `
                    <a href="#/tag/${tag}" class="tag">${tag}</a>
                `).join('')}
            </div>
            <button class="vote-button ${hasVoted ? 'voted' : ''}"
                    data-author="${post.author}"
                    data-permlink="${post.permlink}"
                    ${hasVoted ? 'disabled' : ''}>
                <span class="vote-icon">
                    <i class="far fa-heart"></i>
                </span>
                <span class="vote-count">${post.active_votes?.length || 0}</span>
            </button>
            <button class="comment-button"  data-author="${post.author}" data-permlink="${post.permlink}">
                <span class="comment-icon">
                    <i class="far fa-comment"></i>
                </span>
                <span class="comment-count">${post.children || 0}</span>
            </button>
        </footer>
    `;
}

function renderPostHTML(post) {
    const postDate = new Date(post.created).toLocaleDateString();
    const avatarUrl = post.authorImage || `https://steemitimages.com/u/${post.author}/avatar`;
    return `
            ${generatePostHeader(post, avatarUrl, postDate)}
            ${generatePostContent(post.body)}
            ${generatePostFooter(post)}
    `;
}


async function fetchPosts(options) {
    const query = {
        tag: 'photography',
        limit: 20,
        start_author: options.append ? lastPostAuthor : undefined,
        start_permlink: options.append ? lastPostPermlink : undefined
    };

    const posts = await SteemAPI.getDiscussionsBy('created', query);
    return filterUniquePosts(posts);
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

export async function addComment(parentAuthor, parentPermlink, commentBody) {
    if (!validateVotePermissions()) return false;

    try {
        const key = sessionStorage.getItem('steemPostingKey');
        const username = steemConnection.username;

        // Create a valid permlink (only lowercase alphanumeric characters and hyphens)
        const sanitizedParentAuthor = parentAuthor.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const timestamp = new Date().getTime();
        const permlink = `re-${sanitizedParentAuthor}-${timestamp}`.toLowerCase();

        const commentParams = {
            postingKey: key,
            author: username,
            permlink: permlink,
            parentAuthor: parentAuthor,
            parentPermlink: parentPermlink,
            title: '',
            body: commentBody,
            jsonMetadata: JSON.stringify({
                tags: ['steemgram'],
                app: 'steemgram/1.0'
            })
        };

        await SteemAPI.comment(commentParams);
        return true;
    } catch (error) {
        console.error('Failed to add comment:', error);
        alert('Failed to add comment: ' + error.message);
        return false;
    }
}

// Add marked library if not already included
if (typeof marked === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    document.head.appendChild(script);
}