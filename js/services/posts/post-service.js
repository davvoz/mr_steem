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
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false
        });
    }
    console.log(htmlContent);
    let convertedHtml = typeof marked !== 'undefined' ? marked.parse(htmlContent) : htmlContent;
    
    // Stack per tenere traccia dei tag annidati
    let stack = [];
    
    // Fase 1: Proteggi tutto il contenuto dentro i tag center
    convertedHtml = convertedHtml.replace(
        /<center>([\s\S]*?)<\/center>/gi,
        (match, content) => {
            stack.push(content);
            return `__CENTER_${stack.length - 1}__`;
        }
    );

    // Fase 2: Gestisci le immagini con link
    convertedHtml = convertedHtml.replace(
        /\[!\[(.*?)\]\((.*?)\)\]\((.*?)\)/g,
        (match, alt, imgUrl, linkUrl) => 
            `<a href="${linkUrl}" target="_blank">${generateMediaTag(imgUrl, alt)}</a>`
    );

    // Fase 3: Gestisci immagini semplici
    convertedHtml = convertedHtml.replace(
        /!\[(.*?)\]\((.*?)\)/g,
        (match, alt, url) => generateMediaTag(url, alt)
    );

    // Fase 4: Prima di ripristinare i center, processa la formattazione markdown nel loro contenuto
    stack = stack.map(content => {
        // Processa immagini dentro center
        content = content.replace(
            /!\[(.*?)\]\((.*?)\)/g,
            (match, alt, url) => generateMediaTag(url, alt)
        );
        
        // Processa asterischi e underscore per formattazione
        content = content
            .replace(/\*\*\*([\s\S]*?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([\s\S]*?)\*/g, '<em>$1</em>')
            .replace(/_{3}([\s\S]*?)_{3}/g, '<strong><em>$1</em></strong>')
            .replace(/_{2}([\s\S]*?)_{2}/g, '<strong>$1</strong>')
            .replace(/_([\s\S]*?)_/g, '<em>$1</em>');
            
        return content;
    });

    // Fase 5: Ripristina i center con il contenuto processato
    stack.forEach((content, index) => {
        convertedHtml = convertedHtml.replace(
            `__CENTER_${index}__`,
            `<div class="text-center">${content}</div>`
        );
    });

    // Fase 6: Processa la formattazione markdown nel contenuto principale
    convertedHtml = convertedHtml
        .replace(/\*\*\*([\s\S]*?)\*\*\*/g, '<div class="text-center"><em>$1</em></div>')
        .replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([\s\S]*?)\*/g, '<em>$1</em>')
        .replace(/_{3}([\s\S]*?)_{3}/g, '<strong><em>$1</em></strong>')
        .replace(/_{2}([\s\S]*?)_{2}/g, '<strong>$1</strong>')
        .replace(/_([\s\S]*?)_/g, '<em>$1</em>');

    // Fase 7: Pulizia finale
    convertedHtml = convertedHtml
        // Rimuovi paragrafi vuoti
        .replace(/<p>\s*<\/p>/g, '')
        // Normalizza gli spazi nei br
        .replace(/(<br\s*\/?>\s*){2,}/g, '<br><br>')
        // Correggi header con center
        .replace(/<h([1-6])><div class="text-center">(.*?)<\/div><\/h\1>/g, '<h$1 class="text-center">$2</h$1>')
        // Rimuovi underscore singoli non usati per formattazione
        .replace(/(?<![a-zA-Z])_(?![a-zA-Z])/g, '');

    return `<div class="post-content">
        <div class="post-body markdown-content">${convertedHtml}</div>
    </div>`;
}

function generateMediaTag(url, alt = '') {
    if (!url) return '';
    url = ensureHttps(url);
    
    if (url.includes('i.imgur.com')) {
        return `<img src="${url}" alt="${alt || ''}" class="post-image">`;
    }
    
    const prepareImageUrl = (url) => {
        if (url.includes('cdn.steemitimages.com')) {
            const cdnPath = url.split('cdn.steemitimages.com/').pop();
            return {
                small: `https://steemitimages.com/640x0/https://cdn.steemitimages.com/${cdnPath}`,
                large: `https://steemitimages.com/1280x0/https://cdn.steemitimages.com/${cdnPath}`
            };
        }
        return {
            small: `https://steemitimages.com/640x0/${url}`,
            large: `https://steemitimages.com/1280x0/${url}`
        };
    };

    const urls = prepareImageUrl(url);
    return `<img src="${urls.small}" alt="${alt || ''}" class="post-image" srcset="${urls.small} 1x, ${urls.large} 2x" loading="lazy">`;
}

function ensureHttps(url) {
    if (!url) return '';
    if (url.startsWith('http://')) {
        return url.replace('http://', 'https://');
    }
    if (!url.startsWith('https://')) {
        return 'https://' + url;
    }
    return url;
}

function generatePostFooter(post) {
    const hasVoted = post.active_votes?.some(vote =>
        vote.voter === steemConnection?.username
    );

    let tags = post.tags || [];

    const isOwnPost = post.author === steemConnection?.username;

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
            <div class="post-actions">
                <button class="vote-button ${hasVoted ? 'voted' : ''}"
                        data-author="${post.author}"
                        data-permlink="${post.permlink}"
                        ${hasVoted ? 'disabled' : ''}>
                    <span class="vote-icon">
                        <i class="far fa-heart"></i>
                    </span>
                    <span class="vote-count">${post.active_votes?.length || 0}</span>
                </button>
                ${!isOwnPost ? `
                    <button class="repost-button" 
                            data-author="${post.author}" 
                            data-permlink="${post.permlink}">
                        <span class="repost-icon">
                            <i class="fas fa-retweet"></i>
                        </span>
                        <span>Repost</span>
                    </button>
                ` : ''}
                <button class="comment-button" 
                        data-author="${post.author}" 
                        data-permlink="${post.permlink}">
                    <span class="comment-icon">
                        <i class="far fa-comment"></i>
                    </span>
                    <span class="comment-count">${post.children || 0}</span>
                </button>
            </div>
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
            //owToast('Vote successful!', 'success');
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

export async function repostContent(originalAuthor, originalPermlink, comment = '') {
    if (!await validateVotePermissions()) return false;

    showLoadingIndicator();
    try {
        const timestamp = new Date().getTime();
        const permlink = `repost-${originalPermlink}-${timestamp}`;
        const username = steemConnection.username;

        // Ottieni il contenuto originale
        const originalPost = await steem.api.getContentAsync(originalAuthor, originalPermlink);
        
        // Prepara il body del repost
        const repostBody = `📢 Reposted from @${originalAuthor}

${comment ? `My thoughts: ${comment}\n\n---\n` : ''}

Original post: https://steemit.com/@${originalAuthor}/${originalPermlink}

${originalPost.body}`;

        if (steemConnection.useKeychain) {
            return new Promise((resolve) => {
                window.steem_keychain.requestPost(
                    username,
                    permlink,
                    '',
                    `[Repost] ${originalPost.title}`,
                    repostBody,
                    JSON.stringify({
                        tags: ['steemgram', 'repost', ...originalPost.json_metadata?.tags || []],
                        app: 'steemgram/1.0',
                        originalAuthor,
                        originalPermlink
                    }),
                    '',
                    '',
                    response => {
                        hideLoadingIndicator();
                        if (response.success) {
                            showToast('Content reposted successfully!', 'success');
                            resolve(true);
                        } else {
                            showToast('Failed to repost: ' + response.message, 'error');
                            resolve(false);
                        }
                    }
                );
            });
        } else {
            const key = sessionStorage.getItem('steemPostingKey');
            await SteemAPI.comment({
                postingKey: key,
                author: username,
                permlink: permlink,
                parentAuthor: '',
                parentPermlink: 'steemgram',
                title: `[Repost] ${originalPost.title}`,
                body: repostBody,
                jsonMetadata: JSON.stringify({
                    tags: ['steemgram', 'repost', ...originalPost.json_metadata?.tags || []],
                    app: 'steemgram/1.0',
                    originalAuthor,
                    originalPermlink
                })
            });
            hideLoadingIndicator();
            showToast('Content reposted successfully!', 'success');
            return true;
        }
    } catch (error) {
        console.error('Failed to repost:', error);
        showToast('Failed to repost: ' + error.message, 'error');
        hideLoadingIndicator();
        return false;
    }
}

// Add marked library if not already included
if (typeof marked === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    document.head.appendChild(script);
}