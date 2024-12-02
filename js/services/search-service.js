class SearchService {
    constructor() {
        this.searchTimeout = null;
        this.lastQuery = '';
    }

    async search(query) {
        try {
            if (query === this.lastQuery) return null;
            this.lastQuery = query;

            // Aumentiamo il limite e cerchiamo senza fermarci al primo match
            const accounts = await steem.api.lookupAccountsAsync(query.toLowerCase(), 20);
            const profiles = await Promise.all(accounts.map(username => this.enrichUserData(username)));

            // Manteniamo invariata la logica per le communities
            const communitiesResponse = await fetch('https://develop-imridd.eu.pythonanywhere.com/api/steem/communities');
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
                }))
            };
        } catch (error) {
            console.error('Error searching:', error);
            return { profiles: [], communities: [] };
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