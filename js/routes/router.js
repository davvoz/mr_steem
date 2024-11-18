import { loadSuggestions } from '../services/posts-manager.js';

export class Router {
    constructor(routes, basePath = '') {
        console.log('Router constructor called');
        console.log('Routes received:', routes);
        this.routes = routes;
        this.basePath = basePath;
        this.currentView = null;
        
        // Handle route changes
        window.addEventListener('hashchange', () => {
            console.log('Hash changed!');
            this.handleRoute();
        });
        window.addEventListener('load', () => this.handleRoute());
    }

    navigate(path) {
        console.log('Router.navigate called with path:', path);
        // Ensure path starts with # but not with #/
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
        // Aggiungi il base path se necessario
        const fullPath = this.basePath ? `${this.basePath}/#${normalizedPath}` : `#${normalizedPath}`;
        window.location.href = fullPath;
        console.log('Hash set to:', window.location.hash);
    }

    async handleRoute() {
        // Normalize the hash by removing # and leading slash if present
        let hash = window.location.hash.slice(1);
        
        // Rimuovi il base path dal hash se presente
        if (this.basePath && hash.startsWith(this.basePath)) {
            hash = hash.slice(this.basePath.length);
        }
        
        // Handle empty hash or just '/' as home route
        if (!hash || hash === '/') {
            hash = '/';
        } else if (hash.startsWith('/')) {
            hash = hash.slice(1);
        }

        console.log('Handling route:', hash);
        
        // Check for dynamic routes first
        for (const [pattern, route] of Object.entries(this.routes)) {
            const normalizedPattern = pattern.startsWith('/') ? pattern.slice(1) : pattern;
            if (normalizedPattern.includes(':')) {
                const regex = new RegExp('^' + normalizedPattern.replace(/:(\w+)/g, '([^/]+)') + '$');
                const match = hash.match(regex);
                if (match) {
                    const params = {};
                    const paramNames = normalizedPattern.match(/:(\w+)/g);
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
        const route = this.routes[hash] || this.routes['/' + hash] || this.routes['/'];
        if (route && route.handler) {
            await route.handler();
            if (hash === '/' || hash === '') {
                const username = sessionStorage.getItem('steemUsername');
                if (username) {
                    await loadSuggestions();
                }
            }
        }
        
        // Update navigation state - normalize route paths for comparison
        document.querySelectorAll('.nav-icons i, .nav-item').forEach(el => {
            el.classList.remove('active');
            const routePath = el.dataset.route;
            const normalizedRoute = routePath?.startsWith('/') ? routePath.slice(1) : routePath;
            if (normalizedRoute === hash) {
                el.classList.add('active');
            }
        });
    }
}