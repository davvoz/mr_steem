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
function generateCommentStats(comment) {
    return `
        <div class="comment-stats">
            <span class="comment-votes">
                <i class="far fa-heart"></i>
                ${comment.active_votes?.length || 0} likes
            </span>
            <span class="comment-replies">
                <i class="far fa-comment"></i>
                ${comment.children || 0} replies
            </span>
        </div>
    `;
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

export async function loadSingleComment(author, permlink) {
    try {
        showLoadingIndicator();
        
        // First get the comment data
        const comment = await steem.api.getContentAsync(author, permlink);
        
        // Then get the author and parent author data
        const [authorAccount, parentAccount] = await Promise.all([
            steem.api.getAccountsAsync([author]),
            steem.api.getAccountsAsync([comment.parent_author])
        ]);

        const processedComment = {
            ...comment,
            authorImage: authorAccount?.[0] ? extractProfileImage(authorAccount[0]) : null,
            parentAuthorImage: parentAccount?.[0] ? extractProfileImage(parentAccount[0]) : null,
        };

        const postView = document.getElementById('post-view');
        if (postView) {
            postView.innerHTML = `
                <div class="post-context-nav">
                    <a href="#/post/${comment.parent_author}/${comment.parent_permlink}" class="back-button">
                        <i class="fas fa-arrow-left"></i> Back to Post
                    </a>
                </div>
                <div class="full-post">
                    ${renderPostHTML({
                        ...processedComment,
                        title: `Comment by @${processedComment.author}`,
                        parent_author: comment.parent_author,
                        parent_permlink: comment.parent_permlink
                    })}
                    
                </div>
            `;
        }

        return processedComment;
    } catch (error) {
        console.error('Error loading comment:', error);
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

    // Step 1: Remove standalone file extensions after image links
    convertedHtml = convertedHtml.replace(/\.(jpe?g|png|gif|webp)\)/gi, '');

    // Step 2: Clean up extra spaces before image markdown
    convertedHtml = convertedHtml.replace(/\s+!\[/g, '![');

    // Step 3: Convert Steemit links to <a> tags
    convertedHtml = convertedHtml.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (match, text, url) => {
            if (url.includes('steemit.com')) {
                return `<a href="${url}" target="_blank">${text}</a>`;
            }
            return match; // Keep the original format for non-Steemit links
        }
    );

    // Step 4: Handle standalone image markdown and convert to <img> tags
    convertedHtml = convertedHtml.replace(
        /!\[([^\]]*)\]\(([^)]+?)(?:\.(jpe?g|png|gif|webp))?\)/gi,
        (match, alt, url, ext) => {
            const finalUrl = ext ? `${url}.${ext}` : url;
            return generateMediaTag(finalUrl.trim(), alt);
        }
    );

    // Step 5: Handle <a> wrapping around image URLs and keep only the image
    convertedHtml = convertedHtml.replace(
        /<a[^>]+href="([^"]+\.(?:jpg|png|jpeg|gif|webp)[^"]*)"[^>]*>.*?<\/a>/ig,
        (match, url) => generateMediaTag(url)
    );
    console.log(convertedHtml);
    // Step 6: dobbiamo convertire roba tipo <center>![C3TZR1g81UNaPs7vzNXHueW5ZM76DSHWEY7onmfLxcK2iPJL81FSnaUvBWcD5iZTFpjf9ezxs3kiupVWRKF61XuqhasvCtC1JRTK9P6Sz7YNnUaWYABNiuL.png](https://cdn.steemitimages.com/DQmRDGakkjKoaVympAAufuzPBV4RV5JAPaBNHW5UvyKR6qr/C3TZR1g81UNaPs7vzNXHueW5ZM76DSHWEY7onmfLxcK2iPJL81FSnaUvBWcD5iZTFpjf9ezxs3kiupVWRKF61XuqhasvCtC1JRTK9P6Sz7YNnUaWYABNiuL</center>
    //in un formato tipo ;<center><img src="https://steemitimages.com/640x0/https://cdn.steemitimages.com/DQmRDGakkjKoaVympAAufuzPBV4RV5JAPaBNHW5UvyKR6qr/C3TZR1g81UNaPs7vzNXHueW5ZM76DSHWEY7onmfLxcK2iPJL81FSnaUvBWcD5iZTFpjf9ezxs3kiupVWRKF61XuqhasvCtC1JRTK9P6Sz7YNnUaWYABNiuL.png" alt="C3TZR1g81UNaPs7vzNXHueW5ZM76DSHWEY7onmfLxcK2iPJL81FSnaUvBWcD5iZTFpjf9ezxs3kiupVWRKF61XuqhasvCtC1JRTK9P6Sz7YNnUaWYABNiuL.png" srcset="https://steemitimages.com/640x0/https://cdn.steemitimages.com/DQmRDGakkjKoaVympAAufuzPBV4RV5JAPaBNHW5UvyKR6qr/C3TZR1g81UNaPs7vzNXHueW5ZM76DSHWEY7onmfLxcK2iPJL81FSnaUvBWcD5iZTFpjf9ezxs3kiupVWRKF61XuqhasvCtC1JRTK9P6Sz7YNnUaWYABNiuL.png 1x, https://steemitimages.com/1280x0/https://cdn.steemitimages.com/DQmRDGakkjKoaVympAAufuzPBV4RV5JAPaBNHW5UvyKR6qr/C3TZR1g81UNaPs7vzNXHueW5ZM76DSHWEY7onmfLxcK2iPJL81FSnaUvBWcD5iZTFpjf9ezxs3kiupVWRKF61XuqhasvCtC1JRTK9P6Sz7YNnUaWYABNiuL.png 2x"></center>


    // Return the final HTML structure
    return `<div class="post-content">
        <div class="post-body markdown-content">${convertedHtml}</div>
    </div>`;
}

function generateMediaTag(url, alt = 'image') {
    // Extract the real URL from nested structures
    const extractRealUrl = (url) => {
        // Pulisci l'URL da wrapper steemitimages.com
        const cleanUrl = url.replace(/https:\/\/steemitimages\.com\/\d+x\d+\//g, '');
        
        // Gestisci gli URL di cdn.steemitimages.com
        if (cleanUrl.includes('cdn.steemitimages.com')) {
            // Estrai l'hash della risorsa
            const hash = cleanUrl.split('/').pop();
            return `https://images.hive.blog/0x0/${hash}`;
        }

        return cleanUrl;
    };

    const finalUrl = extractRealUrl(url);

    if (finalUrl.match(/\.mp4$/i)) {
        return `<video controls class="post-video" loading="lazy">
            <source src="${finalUrl}" type="video/mp4">
            Your browser does not support video playback.
        </video>`;
    }

    // Per le immagini usa un formato più pulito
    return `<img src="${finalUrl}" 
        alt="${alt}"
        class="post-image${finalUrl.match(/\.gif$/i) ? ' gif' : ''}"
        loading="lazy" />`;
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