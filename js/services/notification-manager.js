import { steemConnection } from '../auth/login-manager.js';
import { avatarCache } from '../utils/avatar-cache.js'; // Aggiungi questa importazione

let notifications = [];
let lastCheck = 0;
let isPolling = false;
let isLoading = false;
let lastId = -1;
let hasMore = true;
let lastProcessedId = null;

export async function startNotificationPolling() {
    if (!steemConnection.isConnected || isPolling) return;
    
    isPolling = true;
    await checkNotifications();
    
    // Controlla ogni 30 secondi per nuove notifiche
    setInterval(checkNotifications, 30000);
}

export async function checkNotifications() {
    if (!steemConnection.username) {
        console.log('No user logged in');
        return;
    }

    try {
        const newNotifications = await fetchNotifications();
        console.log('Fetched notifications:', newNotifications); // Debug log
        updateNotificationBadge(newNotifications.filter(n => !n.read).length);
        return newNotifications;
    } catch (error) {
        console.error('Error checking notifications:', error);
    }
}

async function fetchNotifications(fromId = -1, limit = 10) {
    const account = steemConnection.username;
    if (!account) {
        console.error('No account found for notification fetching');
        return [];
    }
    
    console.log(`Fetching notifications for ${account} with limit ${limit}`);
    const newNotifications = [];
    
    try {
        // Usa getDiscussionsByBlog invece di getDiscussionsByAuthorBeforeDate
        const query = {
            tag: account,
            limit: limit,
            start_author: fromId === -1 ? undefined : account,
            start_permlink: fromId === -1 ? undefined : fromId
        };

        const posts = await steem.api.getDiscussionsByBlogAsync(query);
        
        if (!posts || !Array.isArray(posts)) {
            console.error('Invalid posts response:', posts);
            hasMore = false;
            return [];
        }

        console.log(`Retrieved ${posts.length} posts for ${account}`);

        // Per ogni post, prendi i voti
        for (const post of posts) {
            if (post.author !== account) continue; // Salta i post non dell'utente

            try {
                const votes = await steem.api.getActiveVotesAsync(post.author, post.permlink);
                console.log(`Found ${votes.length} votes for post ${post.permlink}`);
                
                // Filtra solo i voti di altri utenti (no self-votes)
                const relevantVotes = votes.filter(vote => vote.voter !== account);
                
                for (const vote of relevantVotes) {
                    newNotifications.push({
                        id: `vote-${vote.time}-${post.permlink}-${vote.voter}`,
                        type: 'vote',
                        from: vote.voter,
                        permlink: post.permlink,
                        weight: vote.percent / 100,
                        timestamp: vote.time,
                        title: post.title || post.permlink,
                        read: false
                    });
                }
            } catch (voteError) {
                console.error(`Error fetching votes for post ${post.permlink}:`, voteError);
                continue; // Continua con il prossimo post se c'è un errore
            }
        }

        // Aggiorna lo stato per infinite scroll
        if (posts.length > 0) {
            const lastPost = posts[posts.length - 1];
            lastId = lastPost.permlink;
            hasMore = posts.length === limit;
        } else {
            hasMore = false;
        }

        // Ordina le notifiche per timestamp decrescente
        return newNotifications.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );

    } catch (error) {
        console.error('Error fetching notifications:', error);
        console.error('Query parameters:', {
            account,
            fromId,
            limit
        });
        hasMore = false;
        return [];
    }
}

function getNotificationText(notification) {
    switch (notification.type) {
        case 'vote':
            return `gave you a ${notification.weight}% upvote on "${notification.title}"`;
        case 'comment':
            return `commented on your post "${notification.title}": "${notification.comment}"`;
        default:
            return 'interacted with your content';
    }
}

// Helper function to get post title
async function getPostTitle(author, permlink) {
    try {
        console.log(`Fetching title for @${author}/${permlink}`); // Debug log
        const content = await steem.api.getContentAsync(author, permlink);
        
        if (!content) {
            console.warn(`No content found for @${author}/${permlink}`);
            return 'Untitled post';
        }

        console.log('Content retrieved:', { 
            title: content.title,
            hasBody: !!content.body,
            author: content.author
        }); // Debug log
        
        return content.title || (content.body ? content.body.substring(0, 60) + '...' : 'Untitled post');
    } catch (error) {
        console.error('Error fetching post title:', error);
        console.error('Parameters:', { author, permlink });
        return 'Untitled post';
    }
}

export async function markAsRead(notificationId) {
    notifications = notifications.map(n => 
        n.id === notificationId ? {...n, read: true} : n
    );
    updateNotificationBadge(notifications.filter(n => !n.read).length);
}

export async function handleVoteNotification(voter, author, permlink, weight) {
    const notification = {
        type: 'vote',
        from: voter,
        permlink: permlink,
        weight: weight,
        timestamp: new Date().toISOString(),
        read: false
    };

    notifications.unshift(notification);
    updateNotificationBadge(notifications.filter(n => !n.read).length);
}

function updateNotificationBadge(count) {
    const badge = document.querySelector('.nav-item[data-route="/notifications"] .notification-badge');
    if (count > 0) {
        if (!badge) {
            const notificationIcon = document.querySelector('.nav-item[data-route="/notifications"]');
            const badgeEl = document.createElement('span');
            badgeEl.className = 'notification-badge';
            badgeEl.textContent = count;
            notificationIcon.appendChild(badgeEl);
        } else {
            badge.textContent = count;
        }
    } else if (badge) {
        badge.remove();
    }
}

export async function renderNotifications() {
    const container = document.getElementById('notifications-view');
    if (!container) return;

    // Reset states on new render
    isLoading = false;
    hasMore = true;
    lastId = -1;

    // Semplifichiamo il container per desktop
    container.innerHTML = `
        <div class="notifications-header">
            <h2>Notifications</h2>
        </div>
        <div class="notifications-list"></div>
        <div class="loading-indicator" style="display: none;">Loading more notifications...</div>
    `;

    // Usiamo il window scroll invece dello scroll del container
    window.addEventListener('scroll', () => {
        if (isLoading || !hasMore) return;

        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollTop + clientHeight >= scrollHeight - 100) {
            loadMoreNotifications();
        }
    });

    await loadMoreNotifications();
}

async function loadMoreNotifications() {
    if (isLoading) {
        console.log('Already loading notifications');
        return;
    }

    const container = document.getElementById('notifications-view');
    if (!container) return;

    const listContainer = container.querySelector('.notifications-list');
    const loadingIndicator = document.querySelector('.loading-indicator');

    try {
        isLoading = true;
        loadingIndicator.style.display = 'block';

        const newNotifications = await fetchNotifications(lastId);
        
        if (!newNotifications || newNotifications.length === 0) {
            hasMore = false;
            if (listContainer.children.length === 0) {
                listContainer.innerHTML = '<div class="no-notifications">No notifications yet</div>';
            }
            return;
        }

        // Precarica gli avatar degli utenti
        const uniqueUsers = [...new Set(newNotifications.map(n => n.from))];
        for (const username of uniqueUsers) {
            if (!avatarCache.has(username)) {
                const avatarUrl = `https://steemitimages.com/u/${username}/avatar/small`;
                avatarCache.set(username, avatarUrl);
            }
        }

        const notificationsHTML = newNotifications.map(n => `
            <div class="notification-item ${n.read ? 'read' : ''}" data-id="${n.id}">
                <div class="notification-avatar">
                    <img src="${avatarCache.get(n.from)}" 
                         alt="${n.from}"
                         onerror="this.src='https://steemitimages.com/u/${n.from}/avatar/small'">
                </div>
                <div class="notification-content">
                    <p><strong>@${n.from}</strong> ${getNotificationText(n)}</p>
                    <small>${new Date(n.timestamp).toLocaleString()}</small>
                </div>
            </div>
        `).join('');

        listContainer.insertAdjacentHTML('beforeend', notificationsHTML);

        // Add click handlers for new items
        const newItems = Array.from(listContainer.children).slice(-newNotifications.length);
        newItems.forEach(item => {
            item.onclick = () => markAsRead(item.dataset.id);
        });

    } catch (error) {
        console.error('Error loading more notifications:', error);
        hasMore = false;
    } finally {
        isLoading = false;
        loadingIndicator.style.display = 'none';
    }
}