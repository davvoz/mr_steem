import { handleLogin, showLoginModal, handleLogout } from '../auth/login-manager.js';
import { loadStories, updateSidebar, loadSuggestions } from '../services/posts-manager.js';
import { showWipNotification } from '../utils/notifications.js';  // Aggiungi questa importazione

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

    // Update WIP features - solo new
    const wipFeatures = document.querySelectorAll('a[data-route="/new"]');
    
    wipFeatures.forEach(feature => {
        feature.addEventListener('click', (e) => {
            e.preventDefault();
            showWipNotification(e.currentTarget.querySelector('span').textContent);
        });
    });

    // Add click handler for notifications - aggiorniamo il selettore
    const notificationsLink = document.querySelector('a[data-route="/notifications"]');
    if (notificationsLink) {
        notificationsLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.hash = '/notifications';
        });
    }

    // Add navigation handler for suggestions
    const suggestionsLink = document.querySelector('[data-route="/suggested"]');
    if (suggestionsLink) {
        suggestionsLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.hash = '/suggestions';
        });
    }

    // Rimuovi il codice WIP per la ricerca e aggiorna con la nuova implementazione
    const searchLink = document.querySelector('[data-route="/search"]');
    if (searchLink) {
        searchLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.hash = '/search';
        });
    }

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

    // Add logout handler
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            showLogoutDialog();
        });
    }

    function showLogoutDialog() {
        // Create dialog elements
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = 'dialog';
        
        dialog.innerHTML = `
            <h3 class="dialog-title">Logout</h3>
            <p class="dialog-message">Are you sure you want to logout?</p>
            <div class="dialog-buttons">
                <button class="dialog-button cancel">Cancel</button>
                <button class="dialog-button confirm">Logout</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Show dialog with animation
        requestAnimationFrame(() => {
            overlay.style.display = 'flex';
            overlay.style.opacity = '0';
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                overlay.style.transition = 'opacity 0.2s ease';
            });
        });

        // Handle dialog buttons
        dialog.querySelector('.cancel').addEventListener('click', () => {
            closeDialog(overlay);
        });

        dialog.querySelector('.confirm').addEventListener('click', () => {
            closeDialog(overlay);
            handleLogout();
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeDialog(overlay);
            }
        });
    }

    function closeDialog(overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(overlay);
        }, 200);
    }

    // Aggiungi setup del menu mobile
    setupMobileMenu();

    // Add other UI event listeners as needed
    console.log('UI event listeners setup complete');
}

// Modifica la gestione del menu mobile
function setupMobileMenu() {
    const hamburger = document.querySelector('.hamburger-menu');
    const navMenu = document.querySelector('.nav-menu');
    
    if (!hamburger || !navMenu) {
        console.error('Mobile menu elements not found');
        return;
    }

    function toggleMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Forza un reflow del DOM per assicurare che la transizione funzioni
        navMenu.offsetHeight;
        
        // Toggle della classe active
        navMenu.classList.toggle('active');
        
        // Aggiorna gli attributi ARIA
        const isActive = navMenu.classList.contains('active');
        hamburger.setAttribute('aria-expanded', isActive);
        navMenu.setAttribute('aria-hidden', !isActive);
        
        // Blocca lo scroll del body quando il menu è aperto
        document.body.style.overflow = isActive ? 'hidden' : '';
    }

    // Rimuovi eventuali listener esistenti
    hamburger.removeEventListener('click', toggleMenu);
    
    // Aggiungi il nuovo listener
    hamburger.addEventListener('click', toggleMenu);
    
    // Gestisci la chiusura del menu
    document.addEventListener('click', (e) => {
        if (!navMenu.contains(e.target) && 
            !hamburger.contains(e.target) && 
            navMenu.classList.contains('active')) {
            navMenu.classList.remove('active');
            hamburger.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }
    });
}