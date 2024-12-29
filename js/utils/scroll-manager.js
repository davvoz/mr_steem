export const scrollManager = {
    enableScroll() {
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('top');
        document.body.style.removeProperty('width');
        document.documentElement.style.removeProperty('overflow');
        window.scrollTo(0, 0);
    },

    disableScroll() {
        
    },

    handleModalClose() {
        this.enableScroll();
        // Force reflow and reset position
        requestAnimationFrame(() => {
            window.scrollTo(0, 0);
            document.body.offsetHeight;
        });
    },

    resetScroll() {
        this.enableScroll();
        // Use RAF to ensure DOM updates are complete
        requestAnimationFrame(() => {
            window.scrollTo(0, 0);
            document.body.offsetHeight;
        });
    }
};
