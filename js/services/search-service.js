class SearchService {
    constructor() {
        this.searchTimeout = null;
        this.lastQuery = '';
    }

    async search(query) {
        try {
            if (query === this.lastQuery) return null;
            this.lastQuery = query;

            // Cerca account che iniziano con la query
            const accounts = await steem.api.lookupAccountsAsync(query, 10);
            
            // Cerca communities dall'API esterna
            const communitiesResponse = await fetch('https://develop-imridd.eu.pythonanywhere.com/api/steem/communities');
            const allCommunities = await communitiesResponse.json();
            
            // Filtra le communities in base alla query
            const communities = allCommunities.filter(community => 
                community.name.toLowerCase().includes(query.toLowerCase()) ||
                (community.title && community.title.toLowerCase().includes(query.toLowerCase()))
            ).slice(0, 10);  // Limita a 10 risultati

            // Cerca corrispondenza esatta per profili
            const exactProfileMatch = accounts.find(username => username.toLowerCase() === query.toLowerCase());
            const profiles = exactProfileMatch ? [await this.enrichUserData(exactProfileMatch)] : await Promise.all(accounts.map(username => this.enrichUserData(username)));

            // Cerca corrispondenza esatta per communities
            const exactCommunityMatch = communities.find(community => community.name.toLowerCase() === query.toLowerCase() || (community.title && community.title.toLowerCase() === query.toLowerCase()));
            const filteredCommunities = exactCommunityMatch ? [exactCommunityMatch] : communities;

            return {
                profiles,
                communities: filteredCommunities.map(community => ({
                    name: community.name,
                    title: community.title || community.name,
                    about: community.about || '',
                    subscribers: community.subscribers || 0,
                    icon: community.avatar_url || `https://steemitimages.com/u/${community.name}/avatar/small`
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
                avatar: `https://steemitimages.com/u/${account.name}/avatar/small`,
                about: metadata.profile?.about || '',
                postCount: account.post_count
            };
        } catch (error) {
            console.error('Error enriching user data:', error);
            return {
                username,
                avatar: `https://steemitimages.com/u/${username}/avatar/small`
            };
        }
    }
}

export const searchService = new SearchService();