import { extractProfileImage } from '../services/post/post-utils.js';
class AvatarCache {
    constructor() {
        this.cache = new Map();
    }

    has(username) {
        return this.cache.has(username);
    }

    get(username) {
        return this.cache.get(username) || this.getDefaultAvatar(username);
    }

    set(username, url) {
        this.cache.set(username, url);
    }

    getDefaultAvatar(username) {
        //usiamo il nostro metodo extractProfileImage
        return extractProfileImage({ name: username });
    }
}

export const avatarCache = new AvatarCache();