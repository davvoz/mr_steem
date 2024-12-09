
export function extractImageFromContent(post) {
    if (!post || !post.body) return null;
    
    try {
        // Try to find Markdown image
        const markdownMatch = post.body.match(/!\[.*?\]\((.*?)\)/);
        if (markdownMatch) return markdownMatch[1];
        
        // Try to find HTML image
        const htmlMatch = post.body.match(/<img[^>]+src="([^">]+)"/);
        if (htmlMatch) return htmlMatch[1];
        
        // Try to find href with image link ,but without <a>
        const htmlMatch2 = post.body.match(/href="([^"]+\.(?:jpg|png|jpeg|gif|webp)[^"]*)"[^>]*>/i);       
        if (htmlMatch2) return htmlMatch2[1];
        // Try to find raw URL or URLs with different patterns or query parameters
        const urlMatch = post.body.match(/(https?:\/\/[^\s<>"']*\.(?:jpg|png|jpeg|gif|webp)(\?[^\s<>"']*)?)/i);
        if (urlMatch) return urlMatch[1];
        
        return null;
    } catch (error) {
        console.warn('Failed to extract image from content:', error);
        return null;
    }
}

export function cleanImageUrl(url) {
    if (!url) return null;
    return url.replace(/\\\//g, '/').trim();
}

export function extractProfileImage(account) {
    try {
        const metadata = null;
        return metadata?.profile?.profile_image ||
         `https://steemitimages.com/u/${account.name}/avatar`;
    } catch (e) {
        return `https://steemitimages.com/u/${account.name}/avatar`;
    }
}