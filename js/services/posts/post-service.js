import { steemConnection } from '../../auth/login-manager.js';
import { extractImageFromContent } from './post-utils.js';
import { showLoadingIndicator, hideLoadingIndicator } from '../ui/loading-indicators.js';
import { displayPosts } from '../../services/posts-manager.js';
import { extractProfileImage } from './post-utils.js';
import { SteemAPI } from '../common/api-wrapper.js';
import { showToast } from '../ui/modals.js';

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
    let convertedHtml = typeof marked !== 'undefined' ? marked.parse(htmlContent) : htmlContent;
    //converti tutti queeli che hanno []()
    //dobbiamo mettere la freccettina per far capire che è un link
    convertedHtml = convertedHtml.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (match, text, url) => `<a href="${url}" target="_blank">${text} <i class="fas fa-external-link-alt"></i></a>`
    );

    // Only convert anchor-wrapped image URLs that actually contain images
    convertedHtml = convertedHtml.replace(
        /<a\s+href="([^"]+\.(jpg|jpeg|png|gif))">\s*\1\s*<\/a>/gi,
        (match, url) => `![image](${url})`
    );

    // Handle centered images with proper formatting
    convertedHtml = convertedHtml.replace(
        /<center>(?:\s*<p>)?!\[(.*?)\]\((.*?)\)(?:<\/p>\s*)?<\/center>/g,
        (match, alt, url) => {
            const imageTag = generateMediaTag(url, alt);
            return `<center><br>\n${imageTag}<br>\n</center>`;
        }
    );

    // Clean up any remaining markdown images
    convertedHtml = convertedHtml.replace(
        /!\[(.*?)\]\((.*?)\)/g,
        (match, alt, url) => generateMediaTag(url, alt)
    );

    return `<div class="post-content">
        <div class="post-body markdown-content">${convertedHtml}</div>
    </div>`;
}


function ensureHttps(url) {
    if (url.startsWith('http://')) {
        return url.replace('http://', 'https://');
    }
    return url;
}

function generateMediaTag(url, alt = 'image') {
    // Ensure HTTPS
    url = ensureHttps(url);
    
    // Clean and prepare the URL
    const prepareImageUrl = (url) => {
        // Extract the full CDN path if present
        if (url.includes('cdn.steemitimages.com')) {
            const cdnPath = url.split('cdn.steemitimages.com/').pop();
            return {
                small: `https://steemitimages.com/640x0/https://cdn.steemitimages.com/${cdnPath}`,
                large: `https://steemitimages.com/1280x0/https://cdn.steemitimages.com/${cdnPath}`
            };
        }
        
        // For regular URLs
        return {
            small: `https://steemitimages.com/640x0/${url}`,
            large: `https://steemitimages.com/1280x0/${url}`
        };
    };

    const urls = prepareImageUrl(url);
    
    return `<img src="${urls.small}" 
        alt="${alt}"
        class="post-image"
        srcset="${urls.small} 1x, ${urls.large} 2x"
        loading="lazy">`;
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

async function validateVotePermissions() {
    if (!steemConnection.isConnected || !steemConnection.username) {
        showToast('Please connect to Steem first', 'error');
        return false;
    }

    if (steemConnection.useKeychain) {
        return window.steem_keychain !== undefined;
    }

    return !!sessionStorage.getItem('steemPostingKey');
}

export async function votePost(author, permlink, weight = 10000) {
    showLoadingIndicator();
    if (!await validateVotePermissions()) return false;

    try {
        if (steemConnection.useKeychain) {
            return new Promise((resolve) => {
                window.steem_keychain.requestVote(
                    steemConnection.username,
                    permlink,
                    author,
                    weight,
                    response => {
                        hideLoadingIndicator();
                        if (response.success) {
                            showToast('Vote successful!', 'success');
                            resolve(true);
                        } else {
                            showToast('Failed to vote: ' + response.message, 'error');
                            resolve(false);
                        }
                    }
                );
            });
        } else {
            const key = sessionStorage.getItem('steemPostingKey');
            await SteemAPI.vote(key, steemConnection.username, author, permlink, weight);
            hideLoadingIndicator();
            showToast('Vote successful!', 'success');
            return true;
        }
    } catch (error) {
        console.error('Failed to vote:', error);
        showToast('Failed to vote: ' + error.message, 'error');
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