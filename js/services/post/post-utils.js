export function extractProfileImage(account) {
    try {
        const metadata = null;
        return metadata?.profile?.profile_image ||
         `https://steemitimages.com/u/${account.name}/avatar`;
    } catch (e) {
        return `https://steemitimages.com/u/${account.name}/avatar`;
    }
}

export function extractImageFromContent(post) {
    console.log(post);
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
        // Try to find raw URL
        const urlMatch = post.body.match(/(https?:\/\/[^\s<>"']*?\.(?:png|jpe?g|gif|webp))/i);
        if (urlMatch) return urlMatch[1];
        
        // Try to find URLs with different patterns
        const urlMatch2 = post.body.match(/(https?:\/\/[^\s<>"']*\.(?:jpg|png|jpeg|gif|webp))/i);
        if (urlMatch2) return urlMatch2[1];
        
        // Try to find URLs with query parameters
        const urlMatch3 = post.body.match(/(https?:\/\/[^\s<>"']*\.(?:jpg|png|jpeg|gif|webp)\?[^\s<>"']*)/i);
        if (urlMatch3) return urlMatch3[1];
        
        return null;
    } catch (error) {
        console.warn('Failed to extract image from content:', error);
        return null;
    }
}


export function cleanImageUrl(url) {
    if (!url) return null;
    try {
        return url.replace(/\\\//g, '/').trim();
    } catch (error) {
        console.warn('Failed to clean image URL:', error);
        return url;
    }
}

export function getFallbackAvatar(username) {
    const fallbacks = [
        `https://images.hive.blog/u/${username}/avatar`,
        `https://steemitimages.com/u/${username}/avatar`,
        'https://steemitimages.com/u/default-avatar/avatar'
    ];
    return fallbacks[0];
}

export function cleanPostContent(post) {
    if (!post || !post.body) return { content: '', images: [] };

    let content = post.body;
    const images = new Set();
    const seenUrls = new Set();

    // Extract all images from content
    const markdownImages = content.match(/!\[.*?\]\((.*?)\)/g) || [];
    const htmlImages = content.match(/<img[^>]+src="([^">]+)"/g) || [];
    const htmlAnchors = content.match(/<a[^>]+href="([^"]+\.(?:jpg|png|jpeg|gif|webp)[^"]*)"[^>]*>/gi) || [];
    const rawUrls = content.match(/(https?:\/\/[^\s<>"']*?\.(?:png|jpe?g|gif|webp))/gi) || [];

    // Process markdown images
    markdownImages.forEach(img => {
        const url = img.match(/!\[.*?\]\((.*?)\)/)[1];
        if (!seenUrls.has(url)) {
            images.add(url);
            seenUrls.add(url);
            content = content.replace(img, '');
        } else {
            content = content.replace(img, '');
        }
    });

    // Process HTML images
    htmlImages.forEach(img => {
        const url = img.match(/src="([^">]+)"/)[1];
        if (!seenUrls.has(url)) {
            images.add(url);
            seenUrls.add(url);
            content = content.replace(img, '');
        } else {
            content = content.replace(img, '');
        }
    });

    // Process HTML anchors with image links
    htmlAnchors.forEach(anchor => {
        const url = anchor.match(/href="([^"]+\.(?:jpg|png|jpeg|gif|webp)[^"]*)"/i)[1];
        if (!seenUrls.has(url)) {
            images.add(url);
            seenUrls.add(url);
            content = content.replace(anchor, '');
        } else {
            content = content.replace(anchor, '');
        }
    });

    // Process raw URLs
    rawUrls.forEach(url => {
        if (!seenUrls.has(url)) {
            images.add(url);
            seenUrls.add(url);
            content = content.replace(url, '');
        } else {
            content = content.replace(url, '');
        }
    });

    // Clean up empty lines and extra spaces
    content = content
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\s+|\s+$/g, '');

    return {
        content,
        images: Array.from(images)
    };
}
