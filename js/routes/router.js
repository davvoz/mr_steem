import { routes } from './routes.js';
import { AppState } from '../state/app-state.js';

export class Router {
    static init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        window.addEventListener('load', () => this.handleRoute());
    }

    static async handleRoute() {
        const hash = window.location.hash.slice(1) || '/';
        const route = this.findMatchingRoute(hash);
        
        if (!route) {
            this.handleNotFound();
            return;
        }

        try {
            AppState.update({ isLoading: true });
            
            // Hide all views
            document.querySelectorAll('.view').forEach(view => 
                view.style.display = 'none'
            );

            // Show target view
            const view = document.getElementById(route.template);
            if (view) view.style.display = 'block';

            // Update page title
            document.title = `InstaClone - ${route.title}`;

            // Load route content
            await route.load(this.extractParams(hash, route.path));

        } catch (error) {
            console.error('Route error:', error);
            this.handleError(error); // Corrected function name
        } finally {
            AppState.update({ isLoading: false });
        }
    }

    static findMatchingRoute(hash) {
        return Object.values(routes).find(route => {
            const routePattern = this.pathToRegex(route.path);
            return routePattern.test(hash);
        });
    }

    static pathToRegex(path) {
        return new RegExp('^' + path.replace(/:[^\s/]+/g, '([^/]+)') + '$');
    }

    static extractParams(hash, path) {
        const paramNames = path.match(/:[^\s/]+/g) || [];
        const paramValues = hash.match(this.pathToRegex(path)) || [];
        
        return paramNames.reduce((params, paramName, i) => {
            params[paramName.slice(1)] = paramValues[i + 1];
            return params;
        }, {});
    }

    static handleNotFound() {
        document.querySelectorAll('.view').forEach(view => 
            view.style.display = 'none'
        );
        const homeView = document.getElementById('home-view');
        if (homeView) homeView.style.display = 'block';
        console.warn('Route not found, redirecting to home');
    }

    static handleError(error) {
        // Implementare gestione errori più sofisticata se necessario
        console.error('Router error:', error);
    }
}