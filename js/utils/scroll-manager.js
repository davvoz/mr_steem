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
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = '0';
        document.body.style.width = '100%';
        document.documentElement.style.overflow = 'hidden';
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
