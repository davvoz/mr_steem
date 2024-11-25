export function extractProfileImage(account) {
    try {
        const metadata = JSON.parse(account.json_metadata);
        return metadata.profile.profile_image;
    } catch (e) {
        return null;
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