import { loadSuggestions } from '../services/posts-manager.js';

export class Router {
    constructor(routes) {
        console.log('Router constructor called');
        console.log('Routes received:', routes);
        this.routes = routes;
        this.currentView = null;
        
        // Handle route changes
        window.addEventListener('hashchange', () => {
            console.log('Hash changed!');
            this.handleRoute();
        });
    }

    navigate(path) {
        console.log('Router.navigate called with path:', path);
        window.location.hash = path;
        console.log('Hash set to:', window.location.hash);
    }

    async handleRoute() {
        const hash = window.location.hash.slice(1) || '/';
        console.log('handleRoute called with hash:', hash);
        
        // Check for dynamic routes first
        for (const [pattern, route] of Object.entries(this.routes)) {
            if (pattern.includes(':')) {
                const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$');
                const match = hash.match(regex);
                if (match) {
                    const params = {};
                    const paramNames = pattern.match(/:(\w+)/g);
                    if (paramNames) {
                        paramNames.forEach((param, index) => {
                            params[param.slice(1)] = match[index + 1];
                        });
                    }
                    await route.handler(params);
                    return;
                }
            }
        }

        // Handle static routes
        const route = this.routes[hash] || this.routes['/'];
        if (route && route.handler) {
            await route.handler();
            if (hash === '/') {
                const username = sessionStorage.getItem('steemUsername');
                if (username) {
                    await loadSuggestions();
                }
            }
        }
        
        // Update navigation state
        document.querySelectorAll('.nav-icons i, .nav-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.route === hash) {
                el.classList.add('active');
            }
        });
    }
}