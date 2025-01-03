import { steemConnection } from '../auth/login-manager.js';
import { avatarCache } from '../utils/avatar-cache.js';
import { showNotificationLoadingIndicator, hideNotificationLoadingIndicator } from './ui/loading-indicators.js';

const NOTIFICATION_TABS = {
    ALL: 'all',
    REPLIES: 'replies',
    MENTIONS: 'mentions',
    UPVOTES: 'upvotes',
    RESTEEMS: 'resteems'
};

let notifications = [];
let cachedNotifications = null;
let isInitialLoading = false;
let currentTab = NOTIFICATION_TABS.ALL;

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

// Update the processCommentThread function to include more context
async function processCommentThread(parentComment, account, newNotifications) {
    const replies = await steem.api.getContentRepliesAsync(parentComment.author, parentComment.permlink);
    
    for (const reply of replies) {
        // Add notification if this is a reply to our comment
        if (reply.parent_author === account) {
            newNotifications.push({
                id: `reply-${reply.created}-${reply.author}`,
                type: 'reply',
                from: reply.author,
                author: reply.author,
                permlink: reply.permlink,
                parentAuthor: reply.parent_author,
                parentPermlink: reply.parent_permlink,
                parentComment: parentComment.body, // Add parent comment context
                timestamp: reply.created,
                title: `Re: ${sanitizeContent(parentComment.body.substring(0, 30))}...`,
                comment: sanitizeContent(reply.body).substring(0, 100),
                app: extractAppName(reply.json_metadata),
                read: false
            });
        }
        
        // Recursively process replies to this comment
        await processCommentThread(reply, account, newNotifications);
    }
}

async function fetchNotifications(limit = 50) {
    const account = steemConnection.username;
    if (!account) {
        console.error('No account found for notification fetching');
        return [];
    }

    console.log(`Fetching notifications for ${account}`);
    const newNotifications = [];

    try {
        // Get account history with correct limit (max 20)
        const history = await steem.api.getAccountHistoryAsync(account, -1, 20);
        
        // Process post votes and comments from history
        for (const [id, transaction] of history || []) {
            const op = transaction.op;
            
            if (op[0] === 'vote' && op[1].author === account) {
                try {
                    const content = await steem.api.getContentAsync(op[1].author, op[1].permlink);
                    
                    if (content) {
                        const isComment = content.parent_author !== '';
                        newNotifications.push({
                            id: `${isComment ? 'comment_vote' : 'vote'}-${transaction.timestamp}-${op[1].voter}`,
                            type: isComment ? 'comment_vote' : 'vote',
                            from: op[1].voter,
                            author: op[1].author,
                            permlink: op[1].permlink,
                            parentContent: isComment ? sanitizeContent(content.body).substring(0, 100) : null,
                            weight: op[1].weight / 100,
                            timestamp: transaction.timestamp,
                            title: content.title || (isComment ? 'comment' : content.permlink),
                            app: extractAppName(content.json_metadata),
                            read: false
                        });
                    }
                } catch (error) {
                    console.warn('Could not fetch content for vote:', error);
                    continue;
                }
            }
        }

        // Get recent posts and their interactions (limit to 10 for better performance)
        const posts = await steem.api.getDiscussionsByBlogAsync({
            tag: account,
            limit: 10,
            start_author: account
        });

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

        return removeDuplicates(newNotifications)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);

    } catch (error) {
        console.error('Error fetching notifications:', error);
        console.error('Query parameters:', { account, limit });
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
            const parentContext = notification.parentComment ? 
                ` "${sanitizeContent(notification.parentComment).substring(0, 30)}..."` : 
                '';
            return `@${notification.from} replied to your comment${parentContext}: "${sanitizeContent(notification.comment)}"`;
        case 'comment_vote':
            return notification.parentContent ?
                `liked your comment: "${sanitizeContent(notification.parentContent)}"` :
                'liked your comment';
        default:
            return 'interacted with your content';
    }
}

function getNotificationIcon(notification) {
    switch (notification.type) {
        case 'vote':
        case 'comment_vote':
            const weight = notification.weight || 0;
            return {
                icon: weight >= 0 ? '❤️' : '💔',
                size: `${0.8 + (Math.abs(weight) / 100 * 0.7)}em`
            };
        case 'comment':
        case 'reply':
            return { icon: '💬', size: '1em' };
        default:
            return { icon: '🔔', size: '1em' };
    }
}

function filterNotificationsByTab(notifications, tab) {
    switch(tab) {
        case NOTIFICATION_TABS.REPLIES:
            return notifications.filter(n => n.type === 'reply' || n.type === 'comment');
        case NOTIFICATION_TABS.MENTIONS:
            return notifications.filter(n => n.type === 'mention');
        case NOTIFICATION_TABS.UPVOTES:
            return notifications.filter(n => n.type === 'vote' || n.type === 'comment_vote');
        case NOTIFICATION_TABS.RESTEEMS:
            return notifications.filter(n => n.type === 'reblog');
        default:
            return notifications;
    }
}

async function loadNotifications(isInitialLoad = false) {
    const container = document.getElementById('notifications-view');
    if (!container) return;

    const listContainer = container.querySelector('.notifications-list');
    if (!listContainer) return;

    try {
        if (isInitialLoad) {
            isInitialLoading = true;
            showNotificationLoadingIndicator();
            cachedNotifications = await fetchNotifications();
        }

        // Se abbiamo già le notifiche in cache, filtriamo solo quelle
        const filteredNotifications = filterNotificationsByTab(cachedNotifications || [], currentTab);
        
        if (!filteredNotifications || filteredNotifications.length === 0) {
            listContainer.innerHTML = `
                <div class="no-notifications">
                    <div class="no-notifications-icon">📭</div>
                    <div class="no-notifications-text">No ${currentTab} notifications</div>
                </div>`;
            return;
        }

        const notificationsHTML = filteredNotifications.map(n => {
            const { icon, size } = getNotificationIcon(n);
            
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
                    <span class="notification-type-icon" style="font-size: ${size}">
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

        listContainer.innerHTML = notificationsHTML;

        setupNotificationItems(listContainer);

    } catch (error) {
        console.error('Error loading notifications:', error);
        listContainer.innerHTML = `
            <div class="error-message">
                <div class="error-icon">❌</div>
                <div class="error-text">Failed to load notifications</div>
                <button onclick="location.reload()" class="retry-button">Retry</button>
            </div>`;
    } finally {
        isInitialLoading = false;
        hideNotificationLoadingIndicator();
    }
}

function updateTabsLoadingState(loading) {
    const container = document.getElementById('notifications-view');
    if (!container) return;

    const tabs = container.querySelectorAll('.tab-button');
    tabs.forEach(tab => {
        if (loading) {
            tab.disabled = true;
            tab.classList.add('loading');
        } else {
            tab.disabled = false;
            tab.classList.remove('loading');
        }
    });

    const refreshButton = container.querySelector('#refresh-notifications');
    if (refreshButton) {
        refreshButton.disabled = loading;
    }
}

async function renderNotifications() {
    const container = document.getElementById('notifications-view');
    if (!container) {
        console.error('Notifications container not found');
        return;
    }

    container.innerHTML = `
        <div class="notifications-header">
            <h2>Notifications</h2>
            <button id="refresh-notifications" class="refresh-button">
                <i class="fas fa-sync-alt"></i>
            </button>
        </div>
        <div class="tag-filter">
            <div class="tag-scroll">
                <button class="tab-button tag-button active" data-tab="${NOTIFICATION_TABS.ALL}">All</button>
                <button class="tab-button tag-button" data-tab="${NOTIFICATION_TABS.REPLIES}">Replies</button>
                <button class="tab-button tag-button" data-tab="${NOTIFICATION_TABS.MENTIONS}">Mentions</button>
                <button class="tab-button tag-button" data-tab="${NOTIFICATION_TABS.UPVOTES}">Upvotes</button>
                <button class="tab-button tag-button" data-tab="${NOTIFICATION_TABS.RESTEEMS}">Resteems</button>
            </div>
        </div>
        <div class="notifications-list"></div>
    `;

    setupTabHandlers(container);
    setupRefreshButton(container);

    // Initial load with fetch
    await loadNotifications(true);
}

function setupTabHandlers(container) {
    container.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            if (isInitialLoading) return;

            // Update active tab
            container.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            currentTab = button.dataset.tab;
            
            // Reload notifications with current tab filter (no fetch needed)
            loadNotifications(false);
        });
    });
}

function setupRefreshButton(container) {
    const refreshButton = container.querySelector('#refresh-notifications');
    if (refreshButton) {
        refreshButton.addEventListener('click', async () => {
            const icon = refreshButton.querySelector('i');
            try {
                if (icon) {
                    refreshButton.disabled = true;
                    icon.classList.add('fa-spin');
                }
                
                // Reset cache and reload everything
                cachedNotifications = null;
                await loadNotifications(true);
            } catch (error) {
                console.error('Error refreshing notifications:', error);
            } finally {
                if (icon) {
                    refreshButton.disabled = false;
                    icon.classList.remove('fa-spin');
                }
            }
        });
    }
}

function setupNotificationItems(container) {
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

function cleanupNotificationsView() {
    const container = document.getElementById('notifications-view');
    if (container) {
        container._notificationScrollHandler = null;
    }
    isInitialLoading = false;
    cachedNotifications = null;
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

export {
    markAsRead,
    handleVoteNotification,
    handleCommentNotification,
    handleReplyNotification,
    renderNotifications,
    cleanupNotificationsView,
    loadNotifications
};

export function storeNotificationsState() {
    const container = document.getElementById('notifications-view');
    if (container) {
        const state = {
            html: container.innerHTML,
            currentTab: currentTab,
            cachedNotifications: cachedNotifications
        };
        sessionStorage.setItem('notificationsState', JSON.stringify(state));
    }
}
