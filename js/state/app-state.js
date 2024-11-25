export class AppState {
    static state = {
        currentUser: null,
        isLoggedIn: false,
        isLoading: false,
        currentView: null,
        errors: [],
        posts: new Map(),
        notifications: [],
        cache: {
            users: new Map(),
            posts: new Map(),
            comments: new Map()
        }
    };

    static observers = new Set();
    
    static subscribe(callback) {
        this.observers.add(callback);
        return () => this.observers.delete(callback);
    }

    static update(changes) {
        const oldState = { ...this.state };
        Object.assign(this.state, changes);
        this.notify(oldState);
    }

    static notify(oldState) {
        this.observers.forEach(callback => callback(this.state, oldState));
    }

    static getState() {
        return { ...this.state };
    }

    static clearCache() {
        this.state.cache = {
            users: new Map(),
            posts: new Map(),
            comments: new Map()
        };
    }

    static addError(error) {
        this.update({
            errors: [...this.state.errors, error]
        });
    }

    static clearErrors() {
        this.update({ errors: [] });
    }
}