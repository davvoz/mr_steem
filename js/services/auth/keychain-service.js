class BaseLoginStrategy {
    constructor(keychainName) {
        this.keychainName = keychainName;
    }

    async login(username, callback) {
        const keychain = this.getKeychain();
        if (!keychain) {
            throw new Error(`${this.keychainName} not found`);
        }

        return new Promise((resolve) => {
            keychain.requestHandshake(() => {
                keychain.requestSignBuffer(
                    username,
                    'Login with Keychain',
                    'Posting',
                    response => {
                        if (response.success) {
                            console.log('Login success:', response);
                            callback?.(response);
                            resolve({ success: true, data: response });
                        } else {
                            console.log('Login failed:', response);
                            resolve({ success: false, error: 'Login failed' });
                        }
                    }
                );
            });
        });
    }

    getKeychain() {
        return window[this.keychainName];
    }
}

class HiveLoginStrategy extends BaseLoginStrategy {
    constructor() {
        super('hive_keychain');
    }
}

class SteemLoginStrategy extends BaseLoginStrategy {
    constructor() {
        super('steem_keychain');
    }
}

class Login {
    constructor(strategy) {
        this.strategy = strategy;
    }

    async login(username, callback) {
        return this.strategy.login(username, callback);
    }
}

export class KeychainLogin {
    static async loginWithHiveKeychain(username, callback) {
        const login = new Login(new HiveLoginStrategy());
        return login.login(username, callback);
    }

    static async loginWithSteemKeychain(username, callback) {
        const login = new Login(new SteemLoginStrategy());
        return login.login(username, callback);
    }

    static isHiveKeychainAvailable() {
        return typeof window.hive_keychain !== 'undefined';
    }

    static isSteemKeychainAvailable() {
        return typeof window.steem_keychain !== 'undefined';
    }
}
