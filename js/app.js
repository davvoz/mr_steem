import { Router } from './routes/router.js';
import { setupUIEventListeners } from './components/ui-handlers.js';
import { routes } from './routes/routes.js';
import {
    checkExistingLogin,
    initializeLoginHandlers,
    attemptSteemLoginAuth
} from './auth/login-manager.js';
import { showWipNotification } from './utils/notifications.js';
import { init as initSidebar } from './services/sidebar/sidebar-service.js';
import { setupPostInteractions } from './services/post/post-interactions.js';
import { setupRepostHandlers } from './services/posts/post-interactions.js';
import { loadStories } from './services/stories/stories-service.js';

class App {
    constructor() {
        this.router = null;
        // Aggiungi configurazione per GitHub Pages
        this.basePath = location.hostname === 'yourusername.github.io' ? '/your-repo-name' : '';
    }

    async init() {
        // Check for existing login before router initialization
        const isLoggedIn = checkExistingLogin();
        
        // Initialize router as singleton
        this.router = new Router(routes, this.basePath);

        if (isLoggedIn) {
            // If logged in, immediately start loading content
            Promise.all([
                loadStories(),
                // Add other initialization tasks here
            ]).catch(error => {
                console.error('Error loading user content:', error);
            });
        }

        // Continue with rest of initialization
        await this.setupEventListeners();
        this.checkSteemAvailability();

        // Only show loading state if we're not already logged in
        if (!isLoggedIn) {
            this.showInitialLoading();
        }

        // Start notification polling if user is logged in
        if (checkExistingLogin()) {
            Promise.all([
                loadStories(),
            ]).catch(error => {
                console.error('Error loading secondary content:', error);
            });
        }

        // Initialize sidebar module
        initSidebar();

        // Load initial home feed after router setup
        if (window.location.hash === '' || window.location.hash === '#/') {
            const { loadHomeFeed } = await import('./services/posts-manager.js');
            loadHomeFeed();
        }

        // Aggiungi l'inizializzazione dei gestori repost
        setupRepostHandlers();
    }

    async setupEventListeners() {
        document.addEventListener('DOMContentLoaded', async () => {
            await initializeLoginHandlers();

            // Add SteemLogin button handler with proper reference
            const steemLoginButton = document.getElementById('steemLoginButton');
            if (steemLoginButton) {
                steemLoginButton.addEventListener('click', () => {
                    attemptSteemLoginAuth();
                });
            }

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

            setupPostInteractions();
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
    setupPostInteractions();
});