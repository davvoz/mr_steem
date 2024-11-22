
import { steemConnection } from '../auth/login-manager.js';

let notifications = [];
let lastCheck = 0;
let isPolling = false;

export async function startNotificationPolling() {
    if (!steemConnection.isConnected || isPolling) return;
    
    isPolling = true;
    await checkNotifications();
    
    // Controlla ogni 30 secondi per nuove notifiche
    setInterval(checkNotifications, 30000);
}

export async function checkNotifications() {
    if (!steemConnection.username) return;

    try {
        const notifications = await fetchNotifications();
        updateNotificationBadge(notifications.filter(n => !n.read).length);
        return notifications;
    } catch (error) {
        console.error('Error checking notifications:', error);
    }
}

async function fetchNotifications() {
    const account = steemConnection.username;
    const newNotifications = [];

    try {
        // Ottieni voti recenti
        const votes = await steem.api.getAccountVotesAsync(account);
        const recentVotes = votes.filter(vote => new Date(vote.timestamp).getTime() > lastCheck);
        
        newNotifications.push(...recentVotes.map(vote => ({
            type: 'vote',
            from: vote.voter,
            permlink: vote.permlink,
            timestamp: vote.timestamp,
            read: false
        })));

        // Ottieni menzioni e commenti
        const mentions = await steem.api.getDiscussionsByBlogAsync({ 
            tag: account, 
            limit: 100 
        });

        const recentMentions = mentions.filter(post => {
            const timestamp = new Date(post.created).getTime();
            return timestamp > lastCheck && (
                post.parent_author === account || // commenti ai tuoi post
                post.body.includes(`@${account}`) // menzioni
            );
        });

        newNotifications.push(...recentMentions.map(mention => ({
            type: mention.parent_author ? 'comment' : 'mention',
            from: mention.author,
            permlink: mention.permlink,
            title: mention.title,
            timestamp: mention.created,
            read: false
        })));

        lastCheck = Date.now();
        notifications = [...newNotifications, ...notifications];
        return notifications;

    } catch (error) {
        console.error('Error fetching notifications:', error);
        return [];
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

    const notificationsList = await fetchNotifications();
    
    container.innerHTML = `
        <div class="notifications-container">
            ${notificationsList.length ? notificationsList.map(notification => `
                <div class="notification-item ${notification.read ? 'read' : ''}" 
                     data-id="${notification.permlink}">
                    <div class="notification-avatar">
                        <img src="https://steemitimages.com/u/${notification.from}/avatar/small" 
                             alt="${notification.from}">
                    </div>
                    <div class="notification-content">
                        <p>
                            <strong>@${notification.from}</strong> 
                            ${getNotificationText(notification)}
                        </p>
                        <small>${new Date(notification.timestamp).toLocaleString()}</small>
                    </div>
                </div>
            `).join('') : '<div class="no-notifications">No notifications yet</div>'}
        </div>
    `;

    // Aggiungi event listeners per il click sulle notifiche
    container.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            markAsRead(id);
            item.classList.add('read');
        });
    });
}

function getNotificationText(notification) {
    switch (notification.type) {
        case 'vote':
            return `liked your post ${notification.permlink}`;
        case 'comment':
            return `commented on your post "${notification.title}"`;
        case 'mention':
            return `mentioned you in "${notification.title}"`;
        default:
            return 'interacted with your content';
    }
}