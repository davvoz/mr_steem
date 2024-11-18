
export class SteemClient {
    constructor() {
        this.connection = null;
        this.username = null;
    }

    async connect(username, key) {
        try {
            steem.api.setOptions({ url: 'https://api.steemit.com' });
            const accounts = await steem.api.getAccountsAsync([username]);
            
            if (accounts && accounts.length > 0) {
                this.username = username;
                this.connection = true;
                
                if (key) {
                    sessionStorage.setItem('steemPostingKey', key);
                }
                
                return accounts[0];
            }
            throw new Error('Account not found');
        } catch (error) {
            console.error('Steem connection error:', error);
            throw error;
        }
    }

    isConnected() {
        return this.connection && this.username;
    }

    getUsername() {
        return this.username;
    }
}

export const steemClient = new SteemClient();