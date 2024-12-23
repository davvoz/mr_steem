import { steemConnection } from '../auth/login-manager.js';
import { avatarCache } from '../utils/avatar-cache.js';
import { showNotificationLoadingIndicator, hideNotificationLoadingIndicator } from './ui/loading-indicators.js';

let notifications = [];
let isPolling = false;
let isLoading = false;
let lastId = -1;
let lastPostPermlink = null;
let hasMore = true;
let pollingIntervalId = null;
let totalFetched = 0;

// Private functions
function decodeText(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

function sanitizeContent(text) {
    if (!text) return '';
    text = text.replace(/<[^>]*>/g, '');
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    text = textarea.value;
    text = text.replace(/!\[.*?\]\(.*?\)/g, '[image]');
    text = text.replace(/https?:\/\/\S+/g, '[link]');
    text = text.replace(/\S+\.(jpg|jpeg|png|gif)\S*/gi, '[image]');
    return text.trim();
}

function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

function removeDuplicates(notifications) {
    const uniqueNotifications = [];
    const ids = new Set();

    for (const notification of notifications) {
        if (!ids.has(notification.id)) {
            uniqueNotifications.push(notification);
            ids.add(notification.id);
        }
    }

    return uniqueNotifications;
}

// Aggiungi questa funzione per estrarre il nome dell'app
function extractAppName(jsonMetadata) {
    try {
        const metadata = typeof jsonMetadata === 'string' ? JSON.parse(jsonMetadata) : jsonMetadata;
        return metadata?.app?.split('/')[0] || 'unknown app';
    } catch (error) {
        return 'unknown app';
    }
}

async function fetchNotifications(fromId = -1, limit = 20) {
    const account = steemConnection.username;
    if (!account) {
        console.error('No account found for notification fetching');
        return [];
    }

    console.log(`Fetching notifications for ${account}`);
    const newNotifications = [];

    try {
        const posts = await steem.api.getDiscussionsByBlogAsync({
            tag: account,
            limit: 30,
            start_author: fromId === -1 ? undefined : account,
            start_permlink: lastPostPermlink || undefined
        });

        if (posts && posts.length > 0) {
            lastPostPermlink = posts[posts.length - 1].permlink;
        }

        for (const post of posts || []) {
            if (post.author === account) {
                const votes = await steem.api.getActiveVotesAsync(post.author, post.permlink);
                for (const vote of votes) {
                    if (vote.voter !== account) {
                        newNotifications.push({
                            id: `vote-${vote.time}-${post.permlink}`,
                            type: 'vote',
                            from: vote.voter,
                            author: post.author,      // Ensure author is always set
                            permlink: post.permlink,
                            weight: vote.percent / 100,
                            timestamp: vote.time,
                            title: sanitizeContent(post.title || post.permlink),
                            app: extractAppName(post.json_metadata),
                            read: false
                        });
                    }
                }
            }

            if (post.children > 0) {
                const replies = await steem.api.getContentRepliesAsync(post.author, post.permlink);
                for (const reply of replies) {
                    if (reply.author !== account) {
                        // Check if this is a reply to a comment
                        const isReplyToComment = reply.parent_author === account && reply.parent_permlink !== post.permlink;

                        newNotifications.push({
                            id: `${isReplyToComment ? 'reply' : 'comment'}-${reply.created}-${reply.author}`,
                            type: isReplyToComment ? 'reply' : 'comment',
                            from: reply.author,
                            author: reply.author,
                            permlink: reply.permlink,
                            parentAuthor: reply.parent_author,
                            parentPermlink: reply.parent_permlink,
                            timestamp: reply.created,
                            title: sanitizeContent(post.title || post.permlink),
                            comment: sanitizeContent(reply.body).substring(0, 100),
                            app: extractAppName(reply.json_metadata),
                            read: false
                        });

                        // Fetch replies to comments
                        const commentReplies = await steem.api.getContentRepliesAsync(reply.author, reply.permlink);
                        for (const commentReply of commentReplies) {
                            if (commentReply.parent_author === account) {
                                newNotifications.push({
                                    id: `reply-${commentReply.created}-${commentReply.author}`,
                                    type: 'reply',
                                    from: commentReply.author,
                                    author: commentReply.author,
                                    permlink: commentReply.permlink,
                                    parentAuthor: commentReply.parent_author,
                                    parentPermlink: commentReply.parent_permlink,
                                    timestamp: commentReply.created,
                                    title: sanitizeContent(post.title || post.permlink),
                                    comment: sanitizeContent(commentReply.body).substring(0, 100),
                                    app: extractAppName(commentReply.json_metadata),
                                    read: false
                                });
                            }
                        }
                    }
                }
            }
        }

        const history = await steem.api.getAccountHistoryAsync(account, -1, 20);

        for (const [id, transaction] of history || []) {
            const op = transaction.op;

            if (op[0] === 'vote' && op[1].author === account) {
                const post = await steem.api.getContentAsync(op[1].author, op[1].permlink);

                newNotifications.push({
                    id: `vote-${transaction.timestamp}-${op[1].voter}`,
                    type: 'vote',
                    from: op[1].voter,
                    author: op[1].author,      // aggiungiamo l'autore del post
                    permlink: op[1].permlink,
                    weight: op[1].weight / 100,
                    timestamp: transaction.timestamp,
                    title: post ? sanitizeContent(post.title || post.permlink) : 'a post',
                    read: false
                });
            }
        }

        totalFetched += newNotifications.length;
        hasMore = posts && posts.length >= 20 && totalFetched < 100;

        return removeDuplicates(newNotifications)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);

    } catch (error) {
        console.error('Error fetching notifications:', error);
        console.error('Query parameters:', { account, fromId, limit });
        hasMore = false;
        return [];
    }
}

function getNotificationText(notification) {
    switch (notification.type) {
        case 'vote':
            const title = notification.title || 'a post';
            return `gave you a ${notification.weight}% upvote on ${sanitizeContent(title)}`;
        case 'comment':
            const commentTitle = notification.title || 'your post';
            const comment = notification.comment ? `: "${sanitizeContent(notification.comment)}"` : '';
            return `commented on ${sanitizeContent(commentTitle)}${comment}`;
        case 'reply':
            return notification.comment ?
                `replied to your comment: "${sanitizeContent(notification.comment)}"` :
                'replied to your comment';
        case 'comment_vote':
            return notification.parentContent ?
                `liked your comment: "${sanitizeContent(notification.parentContent)}"` :
                'liked your comment';
        default:
            return 'interacted with your content';
    }
}

async function loadMoreNotifications() {
    if (isLoading || !hasMore) {
        console.log('Loading state:', { isLoading, hasMore, totalFetched });
        return;
    }

    const container = document.getElementById('notifications-view');
    if (!container) return;

    const listContainer = container.querySelector('.notifications-list');

    try {
        isLoading = true;
        showNotificationLoadingIndicator();

        const newNotifications = await fetchNotifications(lastId);

        console.log('Fetched notifications:', {
            count: newNotifications?.length,
            totalFetched,
            hasMore,
            lastPostPermlink
        });

        if (!newNotifications || newNotifications.length === 0) {
            hasMore = false;
            if (listContainer.children.length === 0) {
                listContainer.innerHTML = '<div class="no-notifications">No notifications yet</div>';
            }
            hideNotificationLoadingIndicator();
            return;
        }

        const existingIds = Array.from(listContainer.children).map(el => el.dataset.id);
        const uniqueNotifications = newNotifications.filter(n => !existingIds.includes(n.id));

        if (uniqueNotifications.length === 0) {
            hasMore = false;
            hideNotificationLoadingIndicator();
            return;
        }

        const lastPost = newNotifications[newNotifications.length - 1];
        if (lastPost && lastPost.permlink) {
            lastId = lastPost.permlink;
            hasMore = newNotifications.length >= 10;
            console.log('Updated lastId:', lastId, 'hasMore:', hasMore);
        } else {
            hasMore = false;
        }

        const notificationsHTML = uniqueNotifications.map(n => {
            // Choose icon and size based on vote weight
            let icon = '💬'; // Default comment icon
            let iconSize = '1em'; // Default size

            if (n.type === 'vote') {
                // Set heart or broken heart based on positive/negative vote
                icon = n.weight >= 0 ? '❤️' : '💔';

                // Scale icon size based on vote weight (0.8em to 1.5em range)
                const absWeight = Math.abs(n.weight);
                iconSize = `${0.8 + (absWeight / 100 * 0.7)}em`;
            }

            return `
            <div class="notification-item ${n.read ? 'read' : ''}" 
             data-id="${n.id}"
             data-author="${n.author || steemConnection.username}"
             data-permlink="${n.permlink}"
             data-type="${n.type}"
             onclick="window.location.hash='/notification/${n.author || steemConnection.username}/${n.permlink}'">
            <div class="notification-content">
                <div class="notification-header">
                <div class="notification-avatar">
                <img src="${avatarCache.get(n.from)}" 
                     alt="${n.from}"
                     onerror="this.src='https://steemitimages.com/u/${n.from}/avatar'">
                </div>
                <div class="notification-username">@${n.from}</div>
                </div>
                <div class="notification-details">
                <div class="notification-header">
                    <span class="notification-type-icon" style="font-size: ${iconSize}">
                    ${icon}
                    </span>
                    
                    <span class="notification-app">via ${n.app}</span>
                </div>
                <p class="notification-text">${getNotificationText(n)}</p>
                <small class="notification-timestamp">${new Date(n.timestamp).toLocaleString()}</small>
                </div>
            </div>
            </div>
        `}).join('');

        listContainer.insertAdjacentHTML('beforeend', notificationsHTML);

        const newItems = Array.from(listContainer.children).slice(-uniqueNotifications.length);
        newItems.forEach(item => {
            item.onclick = async () => {
                const notificationId = item.dataset.id;
                const author = item.dataset.author;
                const permlink = item.dataset.permlink;
                await markAsRead(notificationId);
                window.location.hash = `/notification/${author}/${permlink}`;
            };
        });

    } catch (error) {
        console.error('Error loading more notifications:', error);
        hasMore = totalFetched >= 100;
    } finally {
        isLoading = false;
        hideNotificationLoadingIndicator();
    }
}

async function startNotificationPolling() {
    if (!steemConnection.username || isPolling) return;

    isPolling = true;
    console.log('Starting notification polling');

    await checkNotifications();

    if (!pollingIntervalId) {
        pollingIntervalId = setInterval(checkNotifications, 30000);
    }
}

function stopNotificationPolling() {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }

    isPolling = false;
    notifications = [];
    isLoading = false;
    lastId = -1;
    hasMore = true;

    const notificationsView = document.getElementById('notifications-view');
    if (notificationsView) {
        notificationsView.innerHTML = '';
    }
}

async function checkNotifications() {
    if (!steemConnection.username) {
        console.log('No user logged in');
        return;
    }

    try {
        const newNotifications = await fetchNotifications();
        console.log('Fetched notifications:', newNotifications);
        return newNotifications;
    } catch (error) {
        console.error('Error checking notifications:', error);
    }
}

async function renderNotifications() {
    const container = document.getElementById('notifications-view');
    if (!container) {
        console.error('Notifications container not found');
        return;
    }

    if (await restoreNotificationsState()) {
        return;
    }

    container.innerHTML = `
        <div class="notifications-header">
            <h2>Notifications</h2>
            <button id="refresh-notifications" class="refresh-button">
                <i class="fas fa-sync-alt"></i>
            </button>
        </div>
        <div class="notifications-list"></div>
    `;

    // Aggiungi il gestore per il bottone refresh
    const refreshButton = container.querySelector('#refresh-notifications');
    refreshButton.addEventListener('click', async () => {
        const icon = refreshButton.querySelector('i');
        if (icon) {
            refreshButton.disabled = true;
            icon.classList.add('fa-spin');
        }
        // Reset dello stato
        lastId = -1;
        hasMore = true;
        totalFetched = 0;
        lastPostPermlink = null;

        // Pulisci la lista e ricarica
        const listContainer = container.querySelector('.notifications-list');
        listContainer.innerHTML = '';

        await loadMoreNotifications();

        refreshButton.disabled = false;
        icon.classList.remove('fa-spin');
    });

    // Reset state
    isLoading = false;
    hasMore = true;
    lastId = -1;
    totalFetched = 0;
    lastPostPermlink = null;

    // Setup scroll handler
    const scrollHandler = throttle(() => {
        if (document.documentElement.scrollHeight <= window.innerHeight) {
            // If content doesn't fill the viewport, load more
            if (!isLoading && hasMore) {
                loadMoreNotifications();
            }
            return;
        }

        const scrollPosition = window.innerHeight + window.pageYOffset;
        const threshold = document.documentElement.scrollHeight - (window.innerHeight * 1.5);

        if (scrollPosition >= threshold && !isLoading && hasMore) {
            console.log('Loading more notifications...', {
                scrollPosition,
                threshold,
                isLoading,
                hasMore,
                totalFetched
            });
            loadMoreNotifications();
        }
    }, 150);

    // Remove any existing scroll handler
    if (container._notificationScrollHandler) {
        window.removeEventListener('scroll', container._notificationScrollHandler);
    }

    // Add new scroll handler
    window.addEventListener('scroll', scrollHandler, { passive: true });
    container._notificationScrollHandler = scrollHandler;

    // Initial load
    await loadMoreNotifications();

    // Check if we need to load more content if the initial content doesn't fill the viewport
    if (document.documentElement.scrollHeight <= window.innerHeight && !isLoading && hasMore) {
        await loadMoreNotifications();
    }

    console.log('Notifications rendered with infinite scroll');
}

function cleanupNotificationsView() {
    const container = document.getElementById('notifications-view');
    if (container && container._notificationScrollHandler) {
        window.removeEventListener('scroll', container._notificationScrollHandler);
        container._notificationScrollHandler = null;
    }
    isLoading = false;
    lastPostPermlink = null;
    totalFetched = 0;
}

async function markAsRead(notificationId) {
    notifications = notifications.map(n => {
        if (n.id === notificationId) {
            const element = document.querySelector(`[data-id="${notificationId}"]`);
            if (element) {
                element.classList.add('read');
            }
            return { ...n, read: true };
        }
        return n;
    });
}

async function handleVoteNotification(voter, author, permlink, weight) {
    const notification = {
        type: 'vote',
        from: voter,
        permlink: permlink,
        weight: weight,
        timestamp: new Date().toISOString(),
        read: false
    };

    notifications.unshift(notification);
}

async function handleCommentNotification(author, permlink, parentPermlink, body) {
    const notification = {
        type: 'comment',
        from: author,
        permlink: permlink,
        parentPermlink: parentPermlink,
        comment: body.substring(0, 100) + (body.length > 100 ? '...' : ''),
        timestamp: new Date().toISOString(),
        read: false
    };

    notifications.unshift(notification);
}

async function handleReplyNotification(author, permlink, parentAuthor, parentPermlink, body) {
    const notification = {
        type: 'reply',
        from: author,
        permlink: permlink,
        parentAuthor: parentAuthor,
        parentPermlink: parentPermlink,
        comment: body.substring(0, 100) + (body.length > 100 ? '...' : ''),
        timestamp: new Date().toISOString(),
        read: false
    };

    notifications.unshift(notification);
}

function setupNotificationsInteractions() {
    const container = document.getElementById('notifications-view');
    if (!container) return;

    const scrollHandler = throttle(() => {
        const scrollPosition = window.innerHeight + window.pageYOffset;
        const threshold = document.documentElement.scrollHeight - (window.innerHeight * 1.5);

        if (scrollPosition >= threshold && !isLoading && hasMore) {
            loadMoreNotifications();
        }
    }, 150);

    window.addEventListener('scroll', scrollHandler, { passive: true });
    container._notificationScrollHandler = scrollHandler;

    container.querySelectorAll('.notification-item').forEach(item => {
        item.onclick = async () => {
            const notificationId = item.dataset.id;
            const author = item.dataset.author;
            const permlink = item.dataset.permlink;
            await markAsRead(notificationId);
            window.location.hash = `/notification/${author}/${permlink}`;
        };
    });
}

export {
    startNotificationPolling,
    stopNotificationPolling,
    checkNotifications,
    markAsRead,
    handleVoteNotification,
    handleCommentNotification,
    handleReplyNotification,
    renderNotifications,
    cleanupNotificationsView,
    setupNotificationsInteractions
};

export function storeNotificationsState() {
    const container = document.getElementById('notifications-view');
    if (container) {
        const state = {
            html: container.innerHTML,
            lastId: lastId,
            hasMore: hasMore,
            totalFetched: totalFetched,
            lastPostPermlink: lastPostPermlink
        };
        sessionStorage.setItem('notificationsState', JSON.stringify(state));
    }
}

async function restoreNotificationsState() {
    try {
        const storedState = sessionStorage.getItem('notificationsState');
        if (!storedState) return false;

        const state = JSON.parse(storedState);
        const container = document.getElementById('notifications-view');

        if (container) {
            container.innerHTML = state.html;
            lastId = state.lastId;
            hasMore = state.hasMore;
            totalFetched = state.totalFetched;
            lastPostPermlink = state.lastPostPermlink;

            setupNotificationsInteractions();
            sessionStorage.removeItem('notificationsState');
            return true;
        }
    } catch (error) {
        console.error('Error restoring notifications state:', error);
    }
    return false;
}

