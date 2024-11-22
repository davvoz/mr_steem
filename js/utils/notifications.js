export function showWipNotification(feature) {
    const notification = document.createElement('div');
    notification.className = 'wip-notification';
    notification.textContent = `${feature} feature is coming soon!`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2000);
}