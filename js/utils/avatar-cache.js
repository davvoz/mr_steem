class AvatarCache {
    constructor() {
        this.cache = new Map();
    }

    has(username) {
        return this.cache.has(username);
    }

    get(username) {
        return this.cache.get(username) || this.getDefaultAvatar();
    }

    set(username, url) {
        this.cache.set(username, url);
    }

    getDefaultAvatar() {
        return 'https://material.io/resources/icons/static/icons/baseline-account_circle-24px.svg';
    }
}

export const avatarCache = new AvatarCache();