import { handleLogin, showLoginModal, handleLogout, checkExistingLogin, steemConnection } from '../auth/login-manager.js';
import { loadStories } from '../services/stories/stories-service.js';
import { updateSidebar } from '../services/sidebar/sidebar-service.js';
import { loadSuggestions } from '../services/suggestions/suggestions-service.js';
import {  renderNotifications,  cleanupNotificationsView } from '../services/notification-manager.js';
import { Router } from '../routes/router.js';
import { cleanupInfiniteScroll } from '../services/ui/infinite-scroll.js';
import { loadPostsByTag } from '../services/tag/tag-service.js';

export function setupUIEventListeners() {
    // Setup navigation handling
    setupNavigation();

    // Setup auth-related UI
    setupAuthUI();

    // Setup mobile menu
    setupMobileMenu();

    setupTagFilter();

    console.log('UI event listeners setup complete');

    // Aggiungi handler per i tag buttons
    const tagButtons = document.querySelectorAll('.tag-button');
    tagButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            // Rimuovi la classe active da tutti i bottoni
            tagButtons.forEach(btn => btn.classList.remove('active'));

            // Aggiungi la classe active al bottone cliccato
            e.target.classList.add('active');

            const tag = e.target.dataset.tag;
            const container = document.getElementById('posts-container');
            container.innerHTML = ''; // Clear current posts

            if (tag === 'all') {
                // Se il tag è 'all', ricarica il feed normale
                const { loadHomeFeed } = await import('../services/posts-manager.js');
                loadHomeFeed(false);
            } else {
                // Altrimenti carica i post per il tag specifico
                await loadPostsByTag(tag);
            }
        });
    });
}

function setupNavigation() {
    // Handle navigation menu items
    document.querySelectorAll('[data-route]').forEach(element => {
        element.addEventListener('click', (e) => {
            e.preventDefault();
            const route = e.currentTarget.dataset.route;
            
            // Cleanup notifications view if navigating away
            if (!route.startsWith('/notifications')) {
                cleanupNotificationsView();
            }
            
            Router.navigate(route);
            if (route.startsWith('/post/')) {
                cleanupInfiniteScroll();
            }
        });
    });
}

function setupAuthUI() {
    // Initial UI update based on login status
    updateNavigationUI();

    // Listen for successful login
    window.addEventListener('loginSuccess', async () => {
        try {
            updateNavigationUI();

            // Aggiorna prima l'interfaccia utente
            document.querySelectorAll('.auth-required').forEach(el => {
                el.style.display = 'flex';
            });

            // Avvia immediatamente il polling delle notifiche

            // Carica subito le notifiche
            const notificationsView = document.getElementById('notifications-view');
            if (notificationsView && window.location.hash === '#/notifications') {
                await renderNotifications();
                notificationsView.style.display = 'block'; // Ensure notifications view is displayed
            }

            // Carica gli altri contenuti in background
            Promise.all([
                loadStories(),
                updateSidebar(),
                loadSuggestions()
            ]).catch(error => {
                console.error('Error loading secondary content:', error);
            });

        } catch (error) {
            console.error('Error in login success handler:', error);
        }
    });

    // Listen for logout success
    window.addEventListener('logoutSuccess', () => {
        // Update UI after logout
        updateNavigationUI();
    });

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
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        loginButton.addEventListener('click', async (e) => {
            e.preventDefault();
            const username = document.getElementById('steemUsername').value;
            const key = document.getElementById('steemKey').value;

            try {
                await handleLogin(username, key);
                // Il reindirizzamento al profilo ora viene gestito in handleLogin
            } catch (error) {
                console.error('Login error:', error);
                alert('Login failed: ' + error.message);
            }
        });
    }

    // Hide notifications link if not logged in
    const notificationsLink = document.querySelector('a[data-route="/notifications"]');
    if (notificationsLink) {
        if (!checkExistingLogin()) {
            notificationsLink.style.display = 'none';
        } else {
            notificationsLink.style.display = 'block'; // Ensure link is shown when logged in
            notificationsLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.hash = '/notifications';
            });
        }
    }

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
        // Remove any existing listeners by cloning the node
        const newLogoutLink = logoutLink.cloneNode(true);
        logoutLink.parentNode.replaceChild(newLogoutLink, logoutLink);

        newLogoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            showLogoutDialog();
        });
    }

    async function showLogoutDialog() {
        try {
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

            dialog.querySelector('.confirm').addEventListener('click', async () => {
                try {
                    closeDialog(overlay);

                    // Prima stoppa il polling e resetta lo stato
                    await resetAppState();

                    // Poi esegui il logout
                    await handleLogout();

                    // Redirect alla home
                    window.location.hash = '/';

                    // Mostra messaggio di conferma
                    showLogoutConfirmation();

                } catch (error) {
                    console.error('Error during logout:', error);
                    showLogoutError(error.message);
                }
            });

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeDialog(overlay);
                }
            });
        } catch (error) {
            console.error('Error showing logout dialog:', error);
            showLogoutError('Could not show logout dialog');
        }
    }

    function closeDialog(overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(overlay);
        }, 200);
    }

    function showLogoutError(message) {
        const notification = document.createElement('div');
        notification.className = 'logout-notification error';
        notification.textContent = `Logout failed: ${message}`;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    const loginLink = document.getElementById('login-link');
    if (loginLink) {
        loginLink.addEventListener('click', (e) => {
            e.preventDefault();
            showLoginModal();
        });
    }
}

// Add new function to handle app state reset
async function resetAppState() {
    try {
        // Stop all active processes
        clearAllIntervals();

        // Clear UI state
        const containers = {
            'stories-container': '',
            'posts-container': '',
            'notifications-view': '',
            'suggestions-container': '<h4>Suggestions For You</h4>'
        };

        Object.entries(containers).forEach(([id, defaultContent]) => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = defaultContent;
            }
        });

        // Reset all views
        document.querySelectorAll('.view').forEach(view => {
            view.style.display = 'none';
        });

        // Show home view
        const homeView = document.getElementById('home-view');
        if (homeView) {
            homeView.style.display = 'block';
        }

        // Reset authentication state
        const authElements = document.querySelectorAll('.auth-required');
        authElements.forEach(el => el.style.display = 'none');

        // Clear stored data
        const keysToRemove = [
            'lastNotificationCheck',
            'steemUserData',
            'theme'
        ];
        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Update navigation
        updateNavigationUI();

        // Dispatch event
        window.dispatchEvent(new CustomEvent('appStateReset'));

    } catch (error) {
        console.error('Error resetting app state:', error);
        throw new Error('Failed to reset application state');
    }
}

function clearAllIntervals() {
    // Clear any existing intervals
    const highestId = window.setInterval(() => { }, 0);
    for (let i = 0; i < highestId; i++) {
        window.clearInterval(i);
    }
}

// Modify the updateNavigationUI() function
function updateNavigationUI() {
    const isLoggedIn = steemConnection.isConnected;

    // Gestione specifica del link delle notifiche
    const notificationsLink = document.getElementById('notifications-link');
    if (notificationsLink) {
        if (isLoggedIn) {
            notificationsLink.style.display = 'flex';
            // Rimuovi eventuali listener esistenti
            notificationsLink.replaceWith(notificationsLink.cloneNode(true));
            // Aggiungi il nuovo listener
            document.getElementById('notifications-link').addEventListener('click', async (e) => {
                e.preventDefault();
                window.location.hash = '/notifications';
                await renderNotifications();
            });
        } else {
            notificationsLink.style.display = 'none';
        }
    }

    // Aggiorna il link del profilo
    const profileLink = document.getElementById('profile-link');
    if (profileLink) {
        if (isLoggedIn) {
            profileLink.style.display = 'flex';
            const username = steemConnection.username;
            profileLink.setAttribute('data-route', `/profile/${username}`);
            profileLink.addEventListener('click', (e) => {
                e.preventDefault();
                Router.navigate(`/profile/${username}`);
            });
        } else {
            profileLink.style.display = 'none';
        }
    }

    // ...resto del codice esistente per gli altri elementi...

    const authDependentItems = [
        { id: 'notifications-link', show: isLoggedIn },
        { id: 'profile-link', show: isLoggedIn },
        { id: 'logout-link', show: isLoggedIn },
        { id: 'login-link', show: !isLoggedIn }
    ];

    authDependentItems.forEach(item => {
        const element = document.getElementById(item.id);
        if (element) {
            element.style.display = item.show ? 'flex' : 'none';

            // Aggiorna immediatamente il badge delle notifiche se necessario
            if (item.id === 'notifications-link' && isLoggedIn) {
            }
        }
    });

    // Update mobile menu items visibility
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) {
        navMenu.classList.toggle('authenticated', isLoggedIn);
    }
}

// Modifica la gestione del menu mobile
function setupMobileMenu() {
    const hamburger = document.querySelector('.hamburger-menu');
    const navMenu = document.querySelector('.nav-menu');

    if (!hamburger || !navMenu) return;

    const toggleMenu = (e) => {
        e.preventDefault();
        e.stopPropagation();

        navMenu.classList.toggle('active');
        document.body.style.overflow =
            navMenu.classList.contains('active') ? 'hidden' : '';
    };

    // Setup event listeners with auto-cleanup
    const cleanup = () => {
        hamburger.removeEventListener('click', toggleMenu);
        document.removeEventListener('click', handleOutsideClick);
    };

    const handleOutsideClick = (e) => {
        if (!navMenu.contains(e.target) &&
            !hamburger.contains(e.target) &&
            navMenu.classList.contains('active')) {
            toggleMenu(e);
        }
    };

    cleanup();
    hamburger.addEventListener('click', toggleMenu);
    document.addEventListener('click', handleOutsideClick);
}

function showLogoutConfirmation() {
    const notification = document.createElement('div');
    notification.className = 'logout-notification';
    notification.textContent = 'Successfully logged out';

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

function setupTagFilter() {
    const tagButtons = document.querySelectorAll('.tag-button');

    tagButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const tag = button.dataset.tag;

            if (tag === 'all') {
                window.location.hash = '/';
            } else {
                window.location.hash = `/tag/${tag}`;
            }
        });
    });
}

function showErrorMessage(container) {
    container.innerHTML = `
        <div class="error-message">
            Failed to load posts. Please try again.
            <button onclick="window.location.reload()" class="retry-button">
                <i class="fas fa-redo"></i> Retry
            </button>
        </div>
    `;
}