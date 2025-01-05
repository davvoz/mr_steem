export class SteemAPI {
    static async getDiscussionsBy(type, query) {
        switch(type) {
            case 'created':
                return steem.api.getDiscussionsByCreatedAsync(query);
            case 'trending':
                return steem.api.getDiscussionsByTrendingAsync(query);
            case 'blog':
                return steem.api.getDiscussionsByBlogAsync(query);
            default:
                throw new Error('Invalid discussion type');
        }
    }

    static async getAccounts(accounts) {
        return steem.api.getAccountsAsync(accounts);
    }

    static async getContent(author, permlink) {
        return steem.api.getContentAsync(author, permlink);
    }

    static async getContentReplies(author, permlink) {
        return steem.api.getContentRepliesAsync(author, permlink);
    }

    static async getActiveVotes(author, permlink) {
        return steem.api.getActiveVotesAsync(author, permlink);
    }

    static async getFollowing(username, startFollowing, type, limit) {
        return steem.api.getFollowingAsync(username, startFollowing, type, limit);
    }

    static async getFollowCount(username) {
        return steem.api.getFollowCountAsync(username);
    }

    static async broadcast(operation, key) {
        return steem.broadcast.sendAsync(
            { operations: [operation], extensions: [] },
            { posting: key }
        );
    }

    static async vote(key, voter, author, permlink, weight) {
        return steem.broadcast.voteAsync(key, voter, author, permlink, weight);
    }

    static async follow(key, follower, following) {
        return steem.broadcast.customJsonAsync(
            key,
            [],
            [follower],
            'follow',
            JSON.stringify(['follow', {
                follower,
                following,
                what: ['blog']
            }])
        );
    }

    static async comment(commentParams) {
        const {
            postingKey,
            parentAuthor,
            parentPermlink,
            author,
            permlink,
            title,
            body,
            jsonMetadata
        } = commentParams;

        return steem.broadcast.commentAsync(
            postingKey,
            parentAuthor,
            parentPermlink,
            author,
            permlink,
            title,
            body,
            jsonMetadata
        );
    }

    static async getAuthorComments(username, startPermlink, limit) {
        // Utilizziamo getDiscussionsByCommentsAsync invece di getDiscussionsByAuthorBeforeDateAsync
        const query = {
            start_author: username,
            start_permlink: startPermlink || '',
            limit: limit || 20
        };
        return steem.api.getDiscussionsByCommentsAsync(query);
    }
}