/**
 * Notification system
 */
class NotificationManager {
    static showNotification(message, type = 'info', options = {}) {
        const dismissible = options.dismissible === true;
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = 'notification notification-' + type + (dismissible ? ' notification-dismissible' : '');

        if (dismissible) {
            const msgEl = document.createElement('div');
            msgEl.className = 'notification-message';
            msgEl.textContent = message;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'notification-dismiss';
            btn.setAttribute('aria-label', 'Dismiss');
            btn.textContent = 'Dismiss';
            btn.addEventListener('click', () => {
                if (notification.parentNode) {
                    notification.classList.add('notification-fade-out');
                    setTimeout(() => {
                        if (notification.parentNode) {
                            document.body.removeChild(notification);
                        }
                    }, 300);
                }
            });
            notification.appendChild(msgEl);
            notification.appendChild(btn);
        } else {
            notification.textContent = message;
        }

        document.body.appendChild(notification);

        if (!dismissible) {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.classList.add('notification-fade-out');
                    setTimeout(() => {
                        if (notification.parentNode) {
                            document.body.removeChild(notification);
                        }
                    }, 300);
                }
            }, 3000);
        }
    }
}

// Add notification method to MarkdownEditor
MarkdownEditor.prototype.showNotification = function(message, type = 'info', options = {}) {
    NotificationManager.showNotification(message, type, options);
};
