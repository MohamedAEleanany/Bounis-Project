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

// Numeral Translation Utility
const NumeralFormatter = {
    westernDigits: ['0','1','2','3','4','5','6','7','8','9'],
    easternDigits: ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'],
    _observer: null,
    
    getFormat() {
        return safeStorage.getItem('numeralFormat') || 'western';
    },
    
    setFormat(format) {
        safeStorage.setItem('numeralFormat', format);
        this.apply();
    },
    
    toggle() {
        const next = this.getFormat() === 'eastern' ? 'western' : 'eastern';
        this.setFormat(next);
    },
    
    toEastern(text) {
        return text.replace(/[0-9]/g, w => this.easternDigits[parseInt(w)]);
    },
    
    toWestern(text) {
        return text.replace(/[٠-٩]/g, e => this.westernDigits[this.easternDigits.indexOf(e)]);
    },
    
    apply() {
        // Disconnect observer during modifications to prevent infinite loop
        if (this._observer) {
            this._observer.disconnect();
        }
        
        const format = this.getFormat();
        const self = this;
        
        function traverse(node) {
            const skipTags = ['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'CANVAS'];
            if (node.nodeType === Node.ELEMENT_NODE && skipTags.includes(node.tagName)) {
                return;
            }
            
            if (node.nodeType === Node.TEXT_NODE) {
                let text = node.nodeValue;
                let newText = format === 'eastern' ? self.toEastern(text) : self.toWestern(text);
                if (text !== newText) {
                    node.nodeValue = newText;
                }
            } else {
                for (let i = 0; i < node.childNodes.length; i++) {
                    traverse(node.childNodes[i]);
                }
            }
        }
        
        traverse(document.body);
        
        // Re-observe
        if (this._observer) {
            this._observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        }
    }
};
window.NumeralFormatter = NumeralFormatter;

// Setup observer and UI toggle button on load
window.addEventListener('DOMContentLoaded', () => {
    // Setup observer reference
    const observer = new MutationObserver(() => {
        NumeralFormatter.apply();
    });
    NumeralFormatter._observer = observer;
    
    // Initial run
    NumeralFormatter.apply();

    // Inject Toggle Button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-dark no-print position-fixed m-3 shadow-lg';
    toggleBtn.style.cssText = 'bottom: 20px; left: 20px; z-index: 9999; border-radius: 30px; font-weight: bold; font-family: "Cairo", sans-serif; display: flex; align-items: center; gap: 8px; border: 2px solid #fff; padding: 10px 18px;';
    toggleBtn.innerHTML = '<span>🔢</span> تحويل الأرقام (١٢٣ / 123)';
    toggleBtn.onclick = () => {
        NumeralFormatter.toggle();
    };
    document.body.appendChild(toggleBtn);
});
