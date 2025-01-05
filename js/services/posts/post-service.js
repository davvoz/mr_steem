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
    console.log(htmlContent);
    
    // Add this at the very beginning of the function, before any other transformations
    // Handle raw image URLs first
    htmlContent = htmlContent.replace(
        /(https?:\/\/(?:[a-z0-9-]+\.)*(?:postimg\.cc|imgur\.com|ibb\.co)[^\s<>"']+\.(?:jpg|jpeg|png|gif|webp))(?:\s|$)/gi,
        (match, url) => `<img src="${url}" alt="image" class="content-image">`
    );
    
    let convertedHtml = typeof marked !== 'undefined' ? marked.parse(htmlContent) : htmlContent;
    console.log(convertedHtml);

    function parseCells(row) {
        return row.split('|')
            .map(cell => cell.trim())
            .filter(cell => cell.length > 0);
    }

    function isSeparatorRow(row) {
        return row.replace(/[|\s-]/g, '').length === 0;
    }

    function generateMediaTag(url, alt = '') {
        // Decode URL to handle encoded characters
        let decodedUrl = decodeURIComponent(url);

        // Handle nested Steem CDN URLs
        const cdnRegex = /https:\/\/cdn\.steemitimages\.com\/\d+x\d+\/(https:\/\/cdn\.steemitimages\.com\/[^"]+)/;
        const match = decodedUrl.match(cdnRegex);
        if (match) {
            decodedUrl = decodeURIComponent(match[1]);
        }

        if (decodedUrl.match(/\.(mp4|webm|ogg)$/i)) {
            return `<video controls><source src="${decodedUrl}" type="video/${decodedUrl.split('.').pop()}">Your browser does not support the video tag.</video>`;
        } else if (decodedUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            return `<img src="${decodedUrl}" 
                        alt="${alt || 'image'}" 
                        class="content-image"
                        onerror="this.onerror=null; this.src='/images/broken-image.png'; this.classList.add('broken-image');">`;
        }
        return `<a href="${decodedUrl}" target="_blank">${decodedUrl}</a>`;
    }

    // First, handle all image patterns - BEFORE any other transformations

    // 1. Handle centered images first
    convertedHtml = convertedHtml.replace(
        /<center>!\[([^\]]*)\]\(([^)]+)\)<\/center>/g,
        (_, alt, url) => {
            if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                return `<center><img src="${url}" alt="${alt || 'image'}" class="content-image"></center>`;
            }
            return `<center>${generateMediaTag(url, alt)}</center>`;
        }
    );

    // 2. Handle non-centered images with CDN resize URL pattern
    convertedHtml = convertedHtml.replace(
        /!\[([^\]]*)\]\((https:\/\/cdn\.steemitimages\.com\/\d+x\d+\/[^)]+)\)/g,
        (_, alt, url) => {
            if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                return `<img src="${url}" alt="${alt || 'image'}" class="content-image">`;
            }
            return generateMediaTag(url, alt);
        }
    );

    // 3. Handle regular images
    convertedHtml = convertedHtml.replace(
        /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
        (_, alt, url) => {
            if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                return `<img src="${url}" alt="${alt || 'image'}" class="content-image">`;
            }
            return generateMediaTag(url, alt);
        }
    );

    // Handle standalone CDN URLs and text formatting at the start
    convertedHtml = convertedHtml.replace(
        /(<div[^>]*>)?\s*(https:\/\/cdn\.steemitimages\.com\/[^\s<>"]+?\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg))(?:\s|$)/gi,
        (match, divTag, url) => {
            const mediaTag = generateMediaTag(url);
            if (divTag) {
                // If URL was in a div, keep the div
                return `${divTag}${mediaTag}`;
            }
            return mediaTag;
        }
    );

    // Handle text with pull-left/pull-right classes
    convertedHtml = convertedHtml.replace(
        /<div\s+class=["']?pull-(left|right)["']?>(https:\/\/cdn\.steemitimages\.com\/[^\s<>"]+?\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg))<\/div>/gi,
        (match, position, url) => {
            return `<div class="pull-${position}">${generateMediaTag(url)}</div>`;
        }
    );

    // Handle centered markdown images with proper alt text
    convertedHtml = convertedHtml.replace(
        /<center>!\[([^\]]+)\]\((https:\/\/cdn\.steemitimages\.com\/[^\s<>"]+?\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg))\)<\/center>/gi,
        (match, alt, url) => {
            return `<center>${generateMediaTag(url, alt)}</center>`;
        }
    );

    // Handle text with sup tags in center
    convertedHtml = convertedHtml.replace(
        /<center><sup>\*\*([^*]+)\*\*<\/sup><\/center>/g,
        (_, text) => `<center><sup><strong>${text}</strong></sup></center>`
    );

    // Then handle all other transformations

    // Handle special case of centered div with class followed by table marker
    convertedHtml = convertedHtml.replace(
        /<center><div class=([^>]+)>([^<]+)<\/div><\/center>\s*\|\s*-\s*\|/g,
        (_, className, content) => {
            return `<table class="markdown-table">
                <thead>
                    <tr>
                        <th><div class=${className}>${content}</div></th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>`;
        }
    );
    //se troviamo | |- dopo un center allora dobbiamo trasformare il tutto in una tabella con una sola colonna e una riga
    //bonifichiamo precedentemente il | |- da eventuali end line
    

    // Handle special case of centered text followed by table marker
    convertedHtml = convertedHtml.replace(
        /<center>([^<]+)<\/center>\s*\|\s*-\s*\|/g,
        (_, content) => {
            return `<table class="markdown-table">
                <thead>
                    <tr>
                        <th><center>${content}</center></th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>`;
        }
    );

    // Clean up newlines between center and table markers
    convertedHtml = convertedHtml.replace(
        /(<center>.*?<\/center>)\s*\|\s*-\s*\|/g,
        '$1|-|'
    );

    // Transform centered content followed by table markers into a single-column table
    convertedHtml = convertedHtml.replace(
        /(<center>(.*?)<\/center>)\|-\|/g,
        (match, centerTag, content) => {
            return `<table class="markdown-table">
                <thead>
                    <tr>
                        <th>${content}</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>`;
        }
    );

    // First clean up and normalize table markers after centered content
    convertedHtml = convertedHtml.replace(
        /(<center>.*?<\/center>)\s*\|\s*-+\s*\|/g,
        (match, centerContent) => {
            // Extract the content from center tags
            const content = centerContent.replace(/<\/?center>/g, '').trim();
            return `<table class="markdown-table">
                <thead>
                    <tr>
                        <th>${content}</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>`;
        }
    );

    // Handle specific case of centered content followed by table markers with newline
    convertedHtml = convertedHtml.replace(
        /(<center>([^<]+)<\/center>)\s*\|\s*\n\s*-/g,
        (_, centerTag, content) => {
            return `<table class="markdown-table">
                <thead>
                    <tr>
                        <th>${content}</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>`;
        }
    );

    // Remove any remaining pipe/dash markers
    convertedHtml = convertedHtml.replace(/\|\s*\n\s*-/g, '');

    // Handle any remaining regular tables
    convertedHtml = convertedHtml.replace(
        /([^\n]+\|[^\n]+)(\n[-|\s]+\n)([^\n]*\|[^\n]*\n?)+/g,
        (match) => {
            try {
                const rows = match.split('\n').filter(row => row.trim());
                if (rows.length < 3) return match;

                let tableHtml = ['<table class="markdown-table">'];
                let headerProcessed = false;

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    if (isSeparatorRow(row)) continue;

                    const cells = parseCells(row);

                    if (!headerProcessed) {
                        tableHtml.push('<thead><tr>');
                        cells.forEach(cell => {
                            tableHtml.push(`<th>${cell}</th>`);
                        });
                        tableHtml.push('</tr></thead><tbody>');
                        headerProcessed = true;
                    } else {
                        tableHtml.push('<tr>');
                        cells.forEach(cell => {
                            // First, clean up any existing partial conversions
                            let cleanCell = cell.replace(/<a[^>]*><img[^>]*><\/a>/g, '');

                            // Process CDN URLs in the cell
                            cleanCell = cleanCell.replace(
                                /(https:\/\/cdn\.steemitimages\.com\/(?:\d+x\d+\/)?[^\s]+?\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg))(?:\s+|$)/gi,
                                (match, url) => generateMediaTag(url) + ' '
                            );

                            tableHtml.push(`<td>${cleanCell.trim()}</td>`);
                        });
                        tableHtml.push('</tr>');
                    }
                }

                tableHtml.push('</tbody></table>');
                return tableHtml.join('');
            } catch (error) {
                console.error('Error parsing table:', error);
                return match;
            }
        }
    );

    // Other transformations
    convertedHtml = convertedHtml.replace(
        /<center>\s*\*([^\*]+)\*\s*<\/center>/g,
        (_, text) => `<center><strong>${text}</strong></center>`
    );

    convertedHtml = convertedHtml.replace(
        /<a\s+href="([^"]+\.(mp4|webm|ogg))">\s*\1\s*<\/a>/gi,
        (_, url) => generateMediaTag(url)
    );

    convertedHtml = convertedHtml.replace(
        /\*\*([^\*]+)\*\*/g,
        (_, text) => `<strong>${text}</strong>`
    );
    //convertiamo il center che precede un <center>SPUNTI DI RIFLESSIONE</center> |
    //|-
    //in una tabella con una sola colonna e una riga





    convertedHtml = convertedHtml.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (_, text, url) => {
            if (url.match(/\.(mp4|webm|ogg)$/i)) {
                return generateMediaTag(url);
            }
            return `<a href="${url}" target="_blank">${text} <i class="fas fa-external-link-alt"></i></a>`;
        }
    );

    //per tutti i link a che sono immagini o video convertirli in tag img o video
    //sono cose del genere : <center><a href="https://cdn.steemitimages.com/DQmaaNuF8gaoBCnFXZ2atqX8RbaceziqKXatioiUEQZHMMm/Progetto senza titolo (10" target="_blank">https://cdn.steemitimages.com/DQmaaNuF8gaoBCnFXZ2atqX8RbaceziqKXatioiUEQZHMMm/Progetto senza titolo (10</a>.jpg)</center>
    //fai attenzione ai doppi apici

    // Handle direct links to media files that are broken across elements
    convertedHtml = convertedHtml.replace(
        /<center>(?:<a[^>]+>)?(https:\/\/cdn\.steemitimages\.com\/[^<]+)<\/a>([^<]*\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg))<\/center>/gi,
        (match, url, extension) => {
            const fullUrl = url + extension;
            return `<center>${generateMediaTag(fullUrl)}</center>`;
        }
    );

    // Also handle non-centered media links
    convertedHtml = convertedHtml.replace(
        /(?:<a[^>]+>)?(https:\/\/cdn\.steemitimages\.com\/[^<]+)<\/a>([^<]*\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg))/gi,
        (match, url, extension) => {
            const fullUrl = url + extension;
            return generateMediaTag(fullUrl);
        }
    );

    function replaceLinInMediaTag(match, url) {
        return generateMediaTag(url);
    }

    // Handle direct links to media files that are broken across elements
    convertedHtml = convertedHtml.replace(
        /<center>(?:<a[^>]+>)?([^<]+)<\/a>([^<]*\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg))<\/center>/gi,
        replaceLinInMediaTag
    );

    // Also handle non-centered media links
    convertedHtml = convertedHtml.replace(
        /(?:<a[^>]+>)?([^<]+)<\/a>([^<]*\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg))/gi,
        replaceLinInMediaTag
    );

    // Handle URLs within paragraph tags
    convertedHtml = convertedHtml.replace(
        /<p><a[^>]*>(https:\/\/cdn\.steemitimages\.com\/[^<]+?\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg))<\/a><\/p>/gi,
        (match, url) => `<p>${generateMediaTag(url)}</p>`
    );

    // Handle URLs followed by centered captions
    convertedHtml = convertedHtml.replace(
        /(<p>(?:<a[^>]*>)?https:\/\/cdn\.steemitimages\.com\/[^<]+?\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg)(?:<\/a>)?<\/p>)\s*<center><sup><strong>([^<]+)<\/strong><\/sup><\/center>/gi,
        (match, imgPart, caption) => {
            const url = imgPart.replace(/<\/?[^>]+(>|$)/g, '');
            return `<figure>
                ${generateMediaTag(url)}
                <figcaption><center><sup><strong>${caption}</strong></sup></center></figcaption>
            </figure>`;
        }
    );

    // Handle URLs in pull-left/right divs without anchor tags
    convertedHtml = convertedHtml.replace(
        /<div\s+class=["']?pull-(left|right)["']?>\s*(https:\/\/cdn\.steemitimages\.com\/[^<\s]+?\.(?:jpg|jpeg|png|gif|webp|mp4|webm|ogg))\s*<\/div>/gi,
        (match, position, url) => `<div class="pull-${position}">${generateMediaTag(url)}</div>`
    );

    // Handle markdown images in center tags (without creating nested tags)
    convertedHtml = convertedHtml.replace(
        /<center>!\[[^\]]*\]\((https:\/\/cdn\.steemitimages\.com\/[^)]+)\)<\/center>/gi,
        (match, url) => `<center>${generateMediaTag(url)}</center>`
    );

    // Handle text-justify div wrapper
    convertedHtml = convertedHtml.replace(
        /<div class="text-justify">([\s\S]*?)<\/div>/gi,
        (match, content) => `<div class="text-justify">${content}</div>`
    );

    // Handle <a> tags where href and text content are the same CDN URL
    convertedHtml = convertedHtml.replace(
        /<a\s+href="(https:\/\/cdn\.steemitimages\.com\/[^"]+)">[^<]*?cdn\.steemitimages\.com\/[^<]+<\/a>/gi,
        (_, url) => generateMediaTag(url)
    );

    // More aggressive URL matching inside <a> tags
    convertedHtml = convertedHtml.replace(
        /<a[^>]*>(https:\/\/cdn\.steemitimages\.com\/[^<]+)<\/a>/gi,
        (_, url) => generateMediaTag(url)
    );

    //il center che precedede un | |- deve essere una tabella con una sola colonna e una riga

    // Final pass: Convert content followed by | and - markers
    convertedHtml = convertedHtml.replace(
        /(<center>[^<]+<\/center>)\s*\|\s*\n\s*-/g,
        (match, centerContent) => {
            // Clean the center content and convert to table
            return `<table class="markdown-table">
                <thead>
                    <tr>
                        <th>${centerContent}</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>`;
        }
    );

    return `<div class="post-content">
        <div class="post-body markdown-content">${convertedHtml}</div>
    </div>`;
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

function filterUniquePosts(posts) {
    const seen = new Set();
    return posts.filter(post => {
        const key = `${post.author}_${post.permlink}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
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
        showToast('Failed to repost: ' + error.message);
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