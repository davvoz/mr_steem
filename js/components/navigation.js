import { scrollManager } from '../utils/scroll-manager.js';

export function initializeNavigation() {
    const hamburgerButton = document.querySelector('.hamburger-button');
    const navMenu = document.querySelector('.nav-menu');

    if (hamburgerButton && navMenu) {
        hamburgerButton.addEventListener('click', () => {
            const isOpen = navMenu.classList.contains('active');
            
            hamburgerButton.classList.toggle('active');
            navMenu.classList.toggle('active');
            
            if (isOpen) {
                scrollManager.enableScroll();
            } else {
                scrollManager.disableScroll();
            }
        });

        // Handle navigation item clicks
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                hamburgerButton.classList.remove('active');
                scrollManager.enableScroll();
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!navMenu.contains(e.target) && !hamburgerButton.contains(e.target)) {
                if (navMenu.classList.contains('active')) {
                    navMenu.classList.remove('active');
                    hamburgerButton.classList.remove('active');
                    scrollManager.enableScroll();
                }
            }
        });
    }
}
