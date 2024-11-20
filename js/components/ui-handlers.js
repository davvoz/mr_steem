import { handleLogin, showLoginModal } from '../auth/login-manager.js';
import { loadStories, updateSidebar, loadSuggestions } from '../services/posts-manager.js';

export function setupUIEventListeners() {
    // Setup navigation event listeners
    document.querySelectorAll('.nav-icons i').forEach(icon => {
        icon.addEventListener('click', (e) => {
            const route = e.target.dataset.route;
            if (route) {
                window.location.hash = route;
            }
        });
    });

    // Login form handlers
    const loginForm = document.querySelector('.login-form');
    const loginButton = document.getElementById('loginButton');
    
    if (loginButton) {
        loginButton.addEventListener('click', async (e) => {
            e.preventDefault();
            const username = document.getElementById('steemUsername').value;
            const key = document.getElementById('steemKey').value;
            
            try {
                await handleLogin(username, key).then(() => {
                    //navigate to profile
                    window.location.hash = 'profile';
                }    
                );  
                
            } catch (error) {
                console.error('Login error:', error);
                alert('Login failed: ' + error.message);
            }
        });
    }

    // Listen for successful login
    window.addEventListener('loginSuccess', async () => {
        try {
            await Promise.all([
                loadStories(),
                updateSidebar(),
                loadSuggestions()
            ]);
        } catch (error) {
            console.error('Error loading post-login content:', error);
        }
    });

    // Connect to Steem button
    const connectButton = document.getElementById('connect-steem');
    if (connectButton) {
        connectButton.addEventListener('click', () => {
            showLoginModal();
        });
    }

    // Add other UI event listeners as needed
    console.log('UI event listeners setup complete');
}