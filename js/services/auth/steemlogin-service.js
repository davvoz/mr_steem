export class SteemLoginService {
    constructor() {
        this.baseURL = 'https://steemlogin.com';
        this.clientId = 'steemgram';
        // Make sure this matches exactly what you registered in steemlogin.com
        this.redirectUri = 'https://davvoz.github.io/mr_steem/';
    }

    generateLoginURL() {
        try {
            const state = Math.random().toString(36).substring(7);
            sessionStorage.setItem('steemLoginState', state);

            const params = new URLSearchParams({
                client_id: this.clientId,
                response_type: 'code',
                redirect_uri: this.redirectUri,
                scope: 'login,vote,comment,custom_json',
                state: state
            });

            const loginUrl = `${this.baseURL}/oauth2/authorize?${params.toString()}`;
            console.log('Generated login URL:', loginUrl); // For debugging
            return loginUrl;
        } catch (error) {
            console.error('Error generating login URL:', error);
            throw new Error('Failed to initialize login');
        }
    }

    async initiateLogin() {
        try {
            const loginUrl = this.generateLoginURL();
            window.location.href = loginUrl;
        } catch (error) {
            console.error('Login initialization failed:', error);
            throw new Error('Failed to start login process');
        }
    }

    async handleCallback() {
        try {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            const state = params.get('state');
            
            if (!accessToken || !state) {
                return null;
            }

            const savedState = sessionStorage.getItem('steemLoginState');
            if (state !== savedState) {
                throw new Error('Invalid state parameter');
            }

            sessionStorage.removeItem('steemLoginState');
            window.history.replaceState({}, document.title, window.location.pathname);

            return await this.getUserData(accessToken);
        } catch (error) {
            console.error('Callback handling error:', error);
            throw error;
        }
    }

    async getUserData(accessToken) {
        try {
            const response = await fetch(`${this.baseURL}/api/me`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch user data');
            }

            const userData = await response.json();
            return {
                username: userData.username || userData._id,
                accessToken
            };
        } catch (error) {
            console.error('Error fetching user data:', error);
            throw new Error('Failed to fetch user data');
        }
    }
}
