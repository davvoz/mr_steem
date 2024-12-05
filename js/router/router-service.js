import { loadSteemPosts, loadSinglePost } from '../services/posts/post-service.js';
import { loadUserProfile } from '../services/profile/profile-service.js';
import { loadExtendedSuggestions } from '../services/suggestions/suggestions-service.js';

export class RouterService {
    static init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    }

    static async handleRoute() {
        const hash = window.location.hash || '#';
        const path = hash.slice(1).split('/');

        // Hide all views first
        document.querySelectorAll('.view').forEach(view =>
            view.style.display = 'none'
        );

        // Close mobile menu on route change
        if (window.innerWidth <= 768) {
            const navMenu = document.querySelector('.nav-menu');
            if (navMenu) {
                navMenu.classList.remove('active');
            }
        }

        // Show appropriate view based on route
        switch (path[1]) {
            case 'profile':
                if (path[2]) {
                    document.getElementById('profile-view').style.display = 'block';
                    await loadUserProfile(path[2]);
                }
                break;

            case 'post':
                if (path[2] && path[3]) {
                    document.getElementById('post-view').style.display = 'block';
                    await loadSinglePost(path[2], path[3]);
                }
                break;

            case 'suggestions':
                document.getElementById('suggestions-view').style.display = 'block';
                await loadExtendedSuggestions();
                break;

            default:
                document.getElementById('home-view').style.display = 'block';
                await loadSteemPosts();
                break;
        }
    }
}