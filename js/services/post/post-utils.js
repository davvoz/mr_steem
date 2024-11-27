export function extractProfileImage(account) {
    const steemitUrl = `https://steemitimages.com/u/${account.name}/avatar`;
    
    try {
        const metadata = JSON.parse(account.blog_json_metadata);
        return metadata.profile.profile_image || steemitUrl;
    } catch (e) {
        try {
            const metadata = JSON.parse(account.posting_json_metadata);
            return metadata.profile.profile_image || steemitUrl;
        } catch (e) {
            try {
                const metadata = JSON.parse(account.json_metadata);
                return metadata.profile.profile_image || steemitUrl;
            } catch (e) {
                console.warn('Failed to parse profile metadata');
                return steemitUrl;
            }
        }
    }
}

export function extractImageFromContent(post) {
    const imageRegex = /!\[.*?\]\((.*?)\)/;
    const match = post.body.match(imageRegex);
    return match ? match[1] : null;
}

export function cleanImageUrl(url) {
    return url.replace(/\\\//g, '/');
}