export class SteemLoginService {
    constructor() {
        this.baseURL = 'https://steemlogin.com';
        this.clientId = 'steemgram';
    }

    generateLoginURL() {
        try {
            // Usa l'URL completo dell'app come redirect
            const redirectUri = 'https://davvoz.github.io/mr_steem/';
            
            // Costruisci l'URL di login direttamente
            return `${this.baseURL}/login-request/${redirectUri}`;
        } catch (error) {
            console.error('Error generating login URL:', error);
            throw new Error('Failed to initialize login');
        }
    }

    async initiateLogin() {
        try {
            const loginUrl = this.generateLoginURL();
            console.log('Redirecting to:', loginUrl);
            window.location.href = loginUrl;
        } catch (error) {
            console.error('Login initialization failed:', error);
            throw error;
        }
    }

    async handleCallback() {
        try {
            const params = new URLSearchParams(window.location.search);
            const accessToken = params.get('access_token');
            const username = params.get('username');
            
            console.log('Callback params:', { accessToken, username });
            
            if (!accessToken || !username) {
                return null;
            }

            return { username, accessToken };
        } catch (error) {
            console.error('Callback handling error:', error);
            throw error;
        }
    }
}
