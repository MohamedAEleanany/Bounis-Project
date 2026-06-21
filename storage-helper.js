const safeStorage = {
    _memoryStore: {},
    _useWindowName: false,
    
    _init() {
        try {
            const testKey = '__storage_test__';
            window.sessionStorage.setItem(testKey, testKey);
            window.sessionStorage.removeItem(testKey);
        } catch (e) {
            this._useWindowName = true;
            this._loadFromWindowName();
        }
    },
    
    _loadFromWindowName() {
        try {
            if (window.name) {
                const data = JSON.parse(window.name);
                if (data && typeof data === 'object') {
                    this._memoryStore = data;
                }
            }
        } catch (e) {
            this._memoryStore = {};
        }
    },
    
    _saveToWindowName() {
        if (this._useWindowName) {
            try {
                window.name = JSON.stringify(this._memoryStore);
            } catch (e) {
                console.error('Error saving to window.name:', e);
            }
        }
    },
    
    getItem(key) {
        if (!this._useWindowName) {
            try {
                return window.sessionStorage.getItem(key);
            } catch (e) {
                // fallback if it fails dynamically
            }
        }
        return this._memoryStore[key] || null;
    },
    
    setItem(key, value) {
        if (!this._useWindowName) {
            try {
                window.sessionStorage.setItem(key, value);
                return;
            } catch (e) {
                this._useWindowName = true;
                this._loadFromWindowName();
            }
        }
        this._memoryStore[key] = String(value);
        this._saveToWindowName();
    },
    
    removeItem(key) {
        if (!this._useWindowName) {
            try {
                window.sessionStorage.removeItem(key);
                return;
            } catch (e) {
                this._useWindowName = true;
                this._loadFromWindowName();
            }
        }
        delete this._memoryStore[key];
        this._saveToWindowName();
    }
};
safeStorage._init();
window.safeStorage = safeStorage;
