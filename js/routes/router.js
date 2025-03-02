import { loadSuggestions } from '../services/suggestions/suggestions-service.js';

export class Router {
    constructor(routes, basePath = '') {
        if (Router.instance) {
            return Router.instance;
        }
        
        this.routes = routes;
        this.basePath = basePath;
        this.init();
        
        Router.instance = this;
    }

    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
    }

    handleRoute() {
        const hash = window.location.hash.slice(1) || '/';
        let matchedRoute = null;
        let params = {};

        for (const path in this.routes) {
            const routeParts = path.split('/');
            const hashParts = hash.split('/');

            if (routeParts.length === hashParts.length) {
                let match = true;
                const tempParams = {};

                for (let i = 0; i < routeParts.length; i++) {
                    if (routeParts[i].startsWith(':')) {
                        tempParams[routeParts[i].slice(1)] = hashParts[i];
                    } else if (routeParts[i] !== hashParts[i]) {
                        match = false;
                        break;
                    }
                }

                if (match) {
                    matchedRoute = this.routes[path];
                    params = tempParams;
                    break;
                }
            }
        }

        if (matchedRoute) {
            // Check for either handler or init function
            const routeFunction = matchedRoute.handler || matchedRoute.init;
            if (typeof routeFunction === 'function') {
                routeFunction(params);
            } else {
                console.error('No valid handler or init function found for route');
            }
        }
    }

    static navigate(path) {
        window.location.hash = path;
    }
}