import { steemClient } from './api/steem-client.js';
import { Router } from './routes/router.js';
import { setupUIEventListeners } from './components/ui-handlers.js';
import { routes } from './routes/routes.js';
import { checkExistingLogin } from './auth/login-manager.js';

class App {
    constructor() {
        this.router = null;
    }

    async init() {
        this.router = new Router(routes);
        
        // Controlla il login esistente prima di tutto
        const isLoggedIn = checkExistingLogin();
        console.log('Login check:', isLoggedIn ? 'User logged in' : 'No existing login');
        
        await this.setupEventListeners();
        this.checkSteemAvailability();
    }

    async setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            setupUIEventListeners();
            this.router.handleRoute();
            initTheme();
            
            // Add event listener for theme toggle
            document.getElementById('theme-toggle').addEventListener('click', (e) => {
                e.preventDefault();
                toggleTheme();
            });

            // Add listeners for WIP features
            const wipFeatures = document.querySelectorAll('[data-route="/notifications"], [data-route="/search"], [data-route="/new"]');
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

function showWipNotification(feature) {
    const notification = document.createElement('div');
    notification.className = 'wip-notification';
    notification.textContent = `${feature} feature is coming soon!`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2000);
}

const app = new App();
app.init();