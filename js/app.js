import { Router } from './routes/router.js';
import { setupUIEventListeners } from './components/ui-handlers.js';
import { routes } from './routes/routes.js';
import { checkExistingLogin } from './auth/login-manager.js';
import { startNotificationPolling } from './services/notification-manager.js';

class App {
    constructor() {
        this.router = null;
        // Fix GitHub Pages base path
        this.basePath = location.hostname.includes('github.io') ? '/insta_clone' : '';
    }

    async init() {
        this.router = Router; // Update this line to use the Router class directly
        
        // Controlla il login esistente prima di tutto
        const isLoggedIn = checkExistingLogin();
        console.log('Login check:', isLoggedIn ? 'User logged in' : 'No existing login');
        
        await this.setupEventListeners();
        this.checkSteemAvailability();

        // Show loading state when app starts
        this.showInitialLoading();

        // Start notification polling if user is logged in
        if (checkExistingLogin()) {
            await startNotificationPolling();
        }
    }

    async setupEventListeners() {
        // Move this to DOMContentLoaded
        setupUIEventListeners();
        Router.handleRoute(); // Update this line to call handleRoute on the Router class
        initTheme();
        
        // Remove duplicate event listeners since they're now in ui-handlers.js
        const navMenu = document.querySelector('.nav-menu');
        
        // Add accessibility improvements
        document.querySelectorAll('.nav-item').forEach(item => {
            item.setAttribute('role', 'menuitem');
            if (item.getAttribute('data-route')) {
                item.setAttribute('aria-current', 'false');
            }
        });
    }

    checkSteemAvailability() {
        // Improve Steem availability check
        return new Promise((resolve) => {
            if (typeof steem !== 'undefined') {
                resolve(true);
                return;
            }
            
            console.warn('Primary Steem CDN failed, trying fallback...');
            this.loadFallbackSteem()
                .then(() => resolve(true))
                .catch(() => {
                    console.error('All Steem CDN sources failed');
                    resolve(false);
                });
        });
    }

    loadFallbackSteem() {
        const fallbackScript = document.createElement('script');
        fallbackScript.src = 'https://unpkg.com/steem/dist/steem.min.js';
        fallbackScript.onerror = () => {
            console.error('All Steem CDN sources failed');
                   };
        document.head.appendChild(fallbackScript);
    }

    showInitialLoading() {
        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <p>Loading posts...</p>
                </div>
            `;
        }
    }
}

// Dark mode toggle
function initTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const target = current === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
    updateThemeIcon(target);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

/* function showWipNotification(feature) {
    const notification = document.createElement('div');
    notification.className = 'wip-notification';
    notification.textContent = `${feature} feature is coming soon!`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2000);
} */

const app = new App();
app.init();

// Remove duplicate event listener at the bottom
// Remove this:
// document.addEventListener('DOMContentLoaded', () => {
//     setupUIEventListeners();
// });