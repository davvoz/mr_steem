import { Router } from './routes/router.js';
import { setupUIEventListeners } from './components/ui-handlers.js';
import { routes } from './routes/routes.js';
import { checkExistingLogin } from './auth/login-manager.js';
import { startNotificationPolling } from './services/notification-manager.js';
import { showWipNotification } from './utils/notifications.js';
import { init as initSidebar } from './services/sidebar/sidebar-service.js';

class App {
    constructor() {
        this.router = null;
        // Aggiungi configurazione per GitHub Pages
        this.basePath = location.hostname === 'yourusername.github.io' ? '/your-repo-name' : '';
    }

    async init() {
        // Initialize router as singleton
        this.router = new Router(routes, this.basePath);
        
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

        // Initialize sidebar module
        initSidebar();

        // Load initial home feed after router setup
        if (window.location.hash === '' || window.location.hash === '#/') {
            const { loadHomeFeed } = await import('./services/posts-manager.js');
            loadHomeFeed();
        }
    }

    async setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            setupUIEventListeners();
            this.router.handleRoute();
            initTheme();
            
            // Add hamburger menu functionality
            const hamburger = document.querySelector('.hamburger-menu');
            const navMenu = document.querySelector('.nav-menu');
            
            hamburger.addEventListener('click', () => {
                navMenu.classList.toggle('active');
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.nav-menu') && !e.target.closest('.hamburger-menu')) {
                    navMenu.classList.remove('active');
                }
            });

            // Close menu when clicking a nav item
            document.querySelectorAll('.nav-item').forEach(item => {
                item.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        navMenu.classList.remove('active');
                    }
                });
            });

            // Add event listener for theme toggle
            document.getElementById('theme-toggle').addEventListener('click', (e) => {
                e.preventDefault();
                toggleTheme();
            });

            // Update WIP features - rimuoviamo search e lasciamo solo new
            const wipFeatures = document.querySelectorAll('[data-route="/new"]');
            wipFeatures.forEach(feature => {
                feature.addEventListener('click', (e) => {
                    e.preventDefault();
                    showWipNotification(e.currentTarget.querySelector('span').textContent);
                });
            });
        });
    }

    checkSteemAvailability() {
        if (typeof steem === 'undefined') {
            console.warn('Primary Steem CDN failed, trying fallback...');
            this.loadFallbackSteem();
        }
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

document.addEventListener('DOMContentLoaded', () => {
    setupUIEventListeners();
    // Rimuovi la gestione del menu da qui poiché ora è in ui-handlers.js
});