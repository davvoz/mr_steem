import { steemConnection } from '../../auth/login-manager.js';
import { extractImageFromContent } from './post-utils.js';
import { showLoadingIndicator, hideLoadingIndicator } from '../ui/loading-indicators.js';
import { displayPosts } from '../../services/posts-manager.js';
import { extractProfileImage } from './post-utils.js';
import { SteemAPI } from '../common/api-wrapper.js';
import { showToast } from '../ui/modals.js';
import { generatePostContent } from './generatePostContent.js';

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
        const processedPost = await fetchAndProcessPost(author, permlink);
        await renderSinglePost(processedPost);
        return processedPost;
    } catch (error) {
        console.error('Error loading single post:', error);
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

async function fetchAndProcessPost(author, permlink) {
    const [post, [authorAccount]] = await Promise.all([
        steem.api.getContentAsync(author, permlink),
        steem.api.getAccountsAsync([author])
    ]);

    return {
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
        tags: extractTags(post.json_metadata)
    };
}

function extractTags(jsonMetadata) {
    try {
        return jsonMetadata ? JSON.parse(jsonMetadata).tags : [];
    } catch {
        return [];
    }
}

async function renderSinglePost(post) {
    const postView = document.getElementById('post-view');
    if (postView) {
        postView.innerHTML = renderPostHTML(post);
    }
}

export async function loadSingleComment(author, permlink) {
    try {
        showLoadingIndicator();
        const comment = await fetchCommentData(author, permlink);
        const processedComment = await enrichCommentWithAuthorData(comment);
        await renderCommentView(processedComment);
        return processedComment;
    } catch (error) {
        console.error('Error loading comment:', error);
        throw error;
    } finally {
        hideLoadingIndicator();
    }
}

async function fetchCommentData(author, permlink) {
    return steem.api.getContentAsync(author, permlink);
}

async function enrichCommentWithAuthorData(comment) {
    const [authorAccount, parentAccount] = await Promise.all([
        steem.api.getAccountsAsync([comment.author]),
        steem.api.getAccountsAsync([comment.parent_author])
    ]);

    return {
        ...comment,
        authorImage: authorAccount?.[0] ? extractProfileImage(authorAccount[0]) : null,
        parentAuthorImage: parentAccount?.[0] ? extractProfileImage(parentAccount[0]) : null,
    };
}

async function renderCommentView(comment) {
    const postView = document.getElementById('post-view');
    if (!postView) return;

    postView.textContent = '';
    const contextNav = createContextNav(comment);
    const fullPost = createFullPost(comment);
    
    postView.append(contextNav, fullPost);
}

function createContextNav(comment) {
    const contextNav = document.createElement('div');
    contextNav.className = 'post-context-nav';

    const backButton = document.createElement('a');
    backButton.href = `#/post/${comment.parent_author}/${comment.parent_permlink}`;
    backButton.className = 'back-button';

    const backIcon = document.createElement('i');
    backIcon.className = 'fas fa-arrow-left';
    backButton.append(backIcon, ' Back to Post');

    contextNav.appendChild(backButton);
    return contextNav;
}

function createFullPost(comment) {
    const fullPost = document.createElement('div');
    fullPost.className = 'full-post';

    const postData = {
        ...comment,
        title: `Comment by @${comment.author}`,
        parent_author: comment.parent_author,
        parent_permlink: comment.parent_permlink
    };

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = renderPostHTML(postData);
    
    while (tempDiv.firstChild) {
        fullPost.appendChild(tempDiv.firstChild);
    }

    return fullPost;
}

function generatePostHeader(post, avatarUrl, postDate) {
    const header = createHeaderElement();
    const title = createTitleElement(post.title);
    const headerDiv = createHeaderContainer();
    const authorInfo = createAuthorInfo(post, avatarUrl, postDate);

    headerDiv.appendChild(authorInfo);
    header.append(title, headerDiv);

    return header.outerHTML;
}

function createHeaderElement() {
    const header = document.createElement('header');
    header.className = 'post-header-all';
    return header;
}

function createTitleElement(titleText) {
    const title = document.createElement('h1');
    title.className = 'post-title';
    title.style.fontSize = '2.6rem';
    title.style.fontWeight = '300';
    title.textContent = titleText;
    return title;
}

function createHeaderContainer() {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'post-header';
    return headerDiv;
}

function createAuthorInfo(post, avatarUrl, postDate) {
    const authorInfo = document.createElement('div');
    authorInfo.className = 'author-info';

    const avatar = createAvatar(post.author, avatarUrl);
    const authorDetails = createAuthorDetails(post.author, postDate);

    authorInfo.append(avatar, authorDetails);
    return authorInfo;
}

function createAvatar(author, avatarUrl) {
    const avatar = document.createElement('img');
    avatar.src = avatarUrl;
    avatar.alt = author;
    avatar.className = 'author-avatar';
    avatar.onerror = () => { avatar.src = `https://steemitimages.com/u/${author}/avatar`; };
    return avatar;
}

function createAuthorDetails(author, postDate) {
    const authorDetails = document.createElement('div');
    authorDetails.className = 'author-details';

    const authorLink = createAuthorLink(author);
    const dateSpan = createDateSpan(postDate);

    authorDetails.append(authorLink, dateSpan);
    return authorDetails;
}

function createAuthorLink(author) {
    const authorLink = document.createElement('a');
    authorLink.href = `#/profile/${author}`;
    authorLink.className = 'author-name';
    authorLink.textContent = `@${author}`;
    return authorLink;
}

function createDateSpan(postDate) {
    const dateSpan = document.createElement('span');
    dateSpan.className = 'post-date';
    dateSpan.textContent = postDate;
    return dateSpan;
}


function generatePostFooter(post) {
    const { author, active_votes: activeVotes = [], tags = [] } = post;
    const hasVoted = activeVotes.some(vote => vote.voter === steemConnection?.username);
    const isOwnPost = author === steemConnection?.username;
    
    const footerElement = createFooterElement();
    
    footerElement.append(
        createStatsSection(post),
        createTagsSection(tags),
        createActionsSection(post, hasVoted, isOwnPost)
    );

    return footerElement.outerHTML;
}

function createFooterElement() {
    const footer = document.createElement('footer');
    footer.className = 'post-footer';
    return footer;
}

function createStatsSection(post) {
    const statsDiv = document.createElement('div');
    statsDiv.className = 'post-stats';
    
    const stats = [
        { icon: 'far fa-heart', text: `${post.active_votes?.length || 0} likes` },
        { icon: 'far fa-comment', text: `${post.children || 0} comments` },
        { icon: 'fas fa-dollar-sign', text: `${parseFloat(post.pending_payout_value || 0).toFixed(2)}` }
    ];

    stats.forEach(stat => {
        statsDiv.appendChild(createStatsSpan(stat.icon, stat.text, post));
    });

    return statsDiv;
}

function createTagsSection(tags) {
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'post-tags';

    tags.forEach(tag => {
        const tagLink = document.createElement('a');
        tagLink.href = `#/tag/${tag}`;
        tagLink.className = 'tag';
        tagLink.textContent = tag;
        tagsDiv.appendChild(tagLink);
    });

    return tagsDiv;
}

function createActionsSection(post, hasVoted, isOwnPost) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'post-actions';

    const buttons = [
        createVoteButton(post, hasVoted),
        !isOwnPost && createRepostButton(post),
        createCommentButton(post)
    ].filter(Boolean);

    buttons.forEach(button => actionsDiv.appendChild(button));

    return actionsDiv;
}

function createVoteButton(post, hasVoted) {
    const button = createActionButton('vote-button', 'far fa-heart', post.active_votes?.length || 0, hasVoted);
    button.dataset.author = post.author;
    button.dataset.permlink = post.permlink;
    if (hasVoted) button.disabled = true;
    return button;
}

function createRepostButton(post) {
    const button = createActionButton('repost-button', 'fas fa-retweet', null, false, 'Repost');
    button.dataset.author = post.author;
    button.dataset.permlink = post.permlink;
    return button;
}

function createCommentButton(post) {
    const button = createActionButton('comment-button', 'far fa-comment', post.children || 0);
    button.dataset.author = post.author;
    button.dataset.permlink = post.permlink;
    return button;
}

function createStatsSpan(iconClass, text, post) {
    const span = document.createElement('span');
    span.className = 'clickable';
    span.style.cursor = 'pointer';
    span.dataset.postAuthor = post.author;
    span.dataset.postPermlink = post.permlink;

    const icon = document.createElement('i');
    icon.className = iconClass;
    
    span.appendChild(icon);
    span.append(` ${text}`);
    return span;
}

function createActionButton(className, iconClass, count, isActive = false, text = null) {
    const button = document.createElement('button');
    button.className = className + (isActive ? ' voted' : '');

    const iconSpan = document.createElement('span');
    iconSpan.className = className.replace('-button', '-icon');
    
    const icon = document.createElement('i');
    icon.className = iconClass;
    iconSpan.appendChild(icon);
    
    button.appendChild(iconSpan);

    if (count !== null) {
        const countSpan = document.createElement('span');
        countSpan.className = className.replace('-button', '-count');
        countSpan.textContent = count;
        button.appendChild(countSpan);
    }

    if (text) {
        const textSpan = document.createElement('span');
        textSpan.textContent = text;
        button.appendChild(textSpan);
    }

    return button;
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
    try {
        if (!await validateVotePermissions()) {
            return false;
        }
        return await executeVote(author, permlink, weight);
    } catch (error) {
        handleVoteError(error);
        return false;
    } finally {
        hideLoadingIndicator();
    }
}

async function executeVote(author, permlink, weight) {
    if (steemConnection.useKeychain) {
        return executeKeychainVote(author, permlink, weight);
    }
    return executeDirectVote(author, permlink, weight);
}

async function executeKeychainVote(author, permlink, weight) {
    return new Promise((resolve) => {
        window.steem_keychain.requestVote(
            steemConnection.username,
            permlink,
            author,
            weight,
            response => handleVoteResponse(response, resolve)
        );
    });
}

async function executeDirectVote(author, permlink, weight) {
    const key = sessionStorage.getItem('steemPostingKey');
    await SteemAPI.vote(key, steemConnection.username, author, permlink, weight);
    showToast('Vote successful!', 'success');
    return true;
}

function handleVoteResponse(response, resolve) {
    if (response.success) {
        showToast('Vote successful!', 'success');
        resolve(true);
    } else {
        showToast(`Failed to vote: ${response.message}`, 'error');
        resolve(false);
    }
}

function handleVoteError(error) {
    console.error('Failed to vote:', error);
    showToast(`Failed to vote: ${error.message}`, 'error');
}

export async function addComment(parentAuthor, parentPermlink, commentBody) {
    try {
        if (!await validateCommentParams(parentAuthor, parentPermlink, commentBody)) {
            return false;
        }

        const commentParams = await prepareCommentParams(parentAuthor, parentPermlink, commentBody);
        await SteemAPI.comment(commentParams);
        return true;
    } catch (error) {
        handleCommentError(error);
        return false;
    }
}

async function validateCommentParams(parentAuthor, parentPermlink, commentBody) {
    if (!parentAuthor || !parentPermlink || !commentBody) {
        showToast('Invalid comment parameters', 'error');
        return false;
    }
    
    return await validateVotePermissions();
}

async function prepareCommentParams(parentAuthor, parentPermlink, commentBody) {
    const username = steemConnection.username;
    const permlink = generateCommentPermlink(parentAuthor);
    const metadata = createCommentMetadata();

    return {
        postingKey: sessionStorage.getItem('steemPostingKey'),
        author: username,
        permlink,
        parentAuthor,
        parentPermlink,
        title: '',
        body: commentBody,
        jsonMetadata: metadata
    };
}

function generateCommentPermlink(parentAuthor) {
    const sanitizedParentAuthor = parentAuthor.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const timestamp = new Date().getTime();
    return `re-${sanitizedParentAuthor}-${timestamp}`.toLowerCase();
}

function createCommentMetadata() {
    return JSON.stringify({
        tags: ['steemgram'],
        app: 'steemgram/1.0'
    });
}

function handleCommentError(error) {
    console.error('Failed to add comment:', error);
    showToast(`Failed to add comment: ${error.message}`, 'error');
}

export async function repostContent(originalAuthor, originalPermlink, comment = '') {
    //REPOST IS ILLEGAL DO NOT USE !!!
    if (!await validateVotePermissions()) {
        return false;
    }

    showLoadingIndicator();
    try {
        const repostData = await prepareRepostData(originalAuthor, originalPermlink, comment);
        const result = await executeRepost(repostData);
        showToast('Content reposted successfully!', 'success');
        return result;
    } catch (error) {
        handleRepostError(error);
        return false;
    } finally {
        hideLoadingIndicator();
    }
}

async function prepareRepostData(originalAuthor, originalPermlink, comment) {
    const timestamp = new Date().getTime();
    const username = steemConnection.username;
    const permlink = `repost-${originalPermlink}-${timestamp}`;
    const originalPost = await steem.api.getContentAsync(originalAuthor, originalPermlink);
    
    return {
        username,
        permlink,
        originalPost,
        body: createRepostBody(originalAuthor, originalPermlink, originalPost.body, comment),
        title: `[Repost] ${originalPost.title}`,
        metadata: createRepostMetadata(originalPost, originalAuthor, originalPermlink)
    };
}

function createRepostBody(originalAuthor, originalPermlink, originalBody, comment) {
    const commentSection = comment ? `My thoughts: ${comment}\n\n---\n` : '';
    return `📢 Reposted from @${originalAuthor}

${commentSection}
Original post: https://steemit.com/@${originalAuthor}/${originalPermlink}

${originalBody}`;
}

function createRepostMetadata(originalPost, originalAuthor, originalPermlink) {
    return JSON.stringify({
        tags: ['steemgram', 'repost', ...(originalPost.json_metadata?.tags || [])],
        app: 'steemgram/1.0',
        originalAuthor,
        originalPermlink
    });
}

async function executeRepost(repostData) {
    if (steemConnection.useKeychain) {
        return executeKeychainRepost(repostData);
    }
    return executeDirectRepost(repostData);
}

function executeKeychainRepost(repostData) {
    return new Promise((resolve) => {
        window.steem_keychain.requestPost(
            repostData.username,
            repostData.permlink,
            '',
            repostData.title,
            repostData.body,
            repostData.metadata,
            '',
            '',
            response => handleKeychainResponse(response, resolve)
        );
    });
}

async function executeDirectRepost(repostData) {
    const key = sessionStorage.getItem('steemPostingKey');
    await SteemAPI.comment({
        postingKey: key,
        author: repostData.username,
        permlink: repostData.permlink,
        parentAuthor: '',
        parentPermlink: 'steemgram',
        title: repostData.title,
        body: repostData.body,
        jsonMetadata: repostData.metadata
    });
    return true;
}

function handleKeychainResponse(response, resolve) {
    if (response.success) {
        resolve(true);
    } else {
        showToast(`Failed to repost: ${response.message}`, 'error');
        resolve(false);
    }
}

function handleRepostError(error) {
    console.error('Failed to repost:', error);
    showToast(`Failed to repost: ${error.message}`, 'error');
}

// Add marked library if not already included
if (typeof marked === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    document.head.appendChild(script);
}