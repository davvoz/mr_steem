
import { SteemAPI } from '../services/common/api-wrapper.js';

export class AuthService {
    static isLoggedIn = false;
    static currentUser = null;

    static async login(username, key) {
        try {
            // Validate key
            const accounts = await SteemAPI.getAccounts([username]);
            if (!accounts || accounts.length === 0) {
                throw new Error('Account not found');
            }

            this.isLoggedIn = true;
            this.currentUser = username;
            sessionStorage.setItem('steemPostingKey', key);
            sessionStorage.setItem('steemUsername', username);

            return true;
        } catch (error) {
            console.error('Login failed:', error);
            return false;
        }
    }

    static logout() {
        this.isLoggedIn = false;
        this.currentUser = null;
        sessionStorage.removeItem('steemPostingKey');
        sessionStorage.removeItem('steemUsername');
    }

    static checkAuth() {
        const username = sessionStorage.getItem('steemUsername');
        const key = sessionStorage.getItem('steemPostingKey');
        
        if (username && key) {
            this.isLoggedIn = true;
            this.currentUser = username;
            return true;
        }
        return false;
    }
}