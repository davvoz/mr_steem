export class SteemLoginService {
    constructor() {
        this.baseURL = 'https://steemlogin.com';
        this.appName = 'steemgram';
    }

    generateLoginURL() {
        try {
            const state = Math.random().toString(36).substring(7);
            const params = new URLSearchParams({
                response_type: 'code',
                redirect_uri: 'https://davvoz.github.io/mr_steem/',
                scope: 'posting',
                state: state
            });

            // Format: /login-request/appName?params
            const loginUrl = `${this.baseURL}/login-request/${this.appName}?${params.toString()}`;
            
            console.log('Generated login URL:', loginUrl);
            return loginUrl;
        } catch (error) {
            console.error('URL generation error:', error);
            throw new Error('Failed to generate login URL');
        }
    }

    async initiateLogin() {
        // try {
        //     const loginUrl = this.generateLoginURL();
        //     console.log('Redirecting to:', loginUrl);
        //     window.location.href = loginUrl;
        // } catch (error) {
        //     console.error('Login initialization error:', error);
        //     throw error;
        // }
        //facciamo un pop up che dice che non è disponibile
        alert('SteemLogin non è disponibile al momento');

    }

    async handleCallback() {
        try {
            // Check URL parameters for authorization code
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const state = urlParams.get('state');
            
            console.log('Received callback params:', { code, state });

            if (!code) {
                console.error('No authorization code found in URL');
                return null;
            }

            // Get access token using the code
            const tokenResponse = await fetch('https://steemlogin.com/api/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    code: code,
                    client_id: 'steemgram',
                    grant_type: 'authorization_code'
                })
            });

            if (!tokenResponse.ok) {
                throw new Error('Failed to get access token');
            }

            const tokenData = await tokenResponse.json();
            console.log('Token data:', tokenData);

            return {
                username: tokenData.username,
                accessToken: tokenData.access_token
            };
        } catch (error) {
            console.error('Callback handling error:', error);
            throw error;
        }
    }

    async getUserData(accessToken) {
        if (!accessToken) {
            throw new Error('User not logged in. Unable to retrieve data.');
        }
        try {
            const response = await fetch('https://api.steemlogin.com/api/me', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            if (!response.ok) {
                throw new Error('API request error');
            }
            const userData = await response.json();
            console.log('User data:', userData);
            return {
                username: userData.username,
                accessToken
            };
        } catch (error) {
            console.error('Error retrieving user data:', error);
            throw new Error('Error retrieving user data: ' + error.message);
        }
    }
}
