class SearchService {
    constructor() {
        this.searchTimeout = null;
        this.lastQuery = '';
    }

    async search(query) {
        try {
            if (query === this.lastQuery) return null;
            this.lastQuery = query;

            // Run all searches in parallel for better performance
            const [accounts, communitiesResponse, tags] = await Promise.all([
                steem.api.lookupAccountsAsync(query.toLowerCase(), 20),
                fetch('https://develop-imridd.eu.pythonanywhere.com/api/steem/communities'),
                this.searchTags(query)
            ]);

            const profiles = await Promise.all(accounts.map(username => this.enrichUserData(username)));
            const allCommunities = await communitiesResponse.json();
            
            const communities = allCommunities.filter(community => 
                community.name.toLowerCase().includes(query.toLowerCase()) ||
                (community.title && community.title.toLowerCase().includes(query.toLowerCase()))
            ).slice(0, 10);

            return {
                profiles,
                communities: communities.map(community => ({
                    name: community.name,
                    title: community.title || community.name,
                    about: community.about || '',
                    subscribers: community.subscribers || 0,
                    icon: community.avatar_url || `https://steemitimages.com/u/${community.name}/avatar`
                })),
                tags
            };
        } catch (error) {
            console.error('Error searching:', error);
            return { profiles: [], communities: [], tags: [] };
        }
    }

    async searchTags(query) {
        try {
            // Get recent discussions to extract tags
            const discussions = await steem.api.getDiscussionsByCreatedAsync({ limit: 100, tag: '' });
            
            // Extract unique tags from discussions
            const allTags = new Set();
            discussions.forEach(post => {
                try {
                    const metadata = JSON.parse(post.json_metadata);
                    if (metadata.tags) {
                        metadata.tags.forEach(tag => allTags.add(tag));
                    }
                } catch (e) {}
            });

            // Filter and format tags
            return Array.from(allTags)
                .filter(tag => tag.toLowerCase().includes(query.toLowerCase()))
                .map(tag => ({
                    name: tag,
                    posts: 0, // We don't have post count here
                    trending: false
                }))
                .slice(0, 10);
        } catch (error) {
            console.error('Error searching tags:', error);
            return [];
        }
    }

    async enrichUserData(username) {
        try {
            const [account] = await steem.api.getAccountsAsync([username]);
            let metadata = {};
            try {
                metadata = JSON.parse(account.json_metadata);
            } catch (e) {}

            return {
                username: account.name,
                reputation: steem.formatter.reputation(account.reputation),
                avatar: `https://steemitimages.com/u/${account.name}/avatar`,
                about: metadata.profile?.about || '',
                postCount: account.post_count
            };
        } catch (error) {
            console.error('Error enriching user data:', error);
            return {
                username,
                avatar: `https://steemitimages.com/u/${username}/avatar`
            };
        }
    }
}

export const searchService = new SearchService();