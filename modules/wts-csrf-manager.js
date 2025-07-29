/**
 * WTS CSRF Manager Module - Handles all CSRF token operations
 * Provides network request interception, token extraction, storage, and management
 * 
 * @author WTS Development Team
 * @version 1.0.0
 * @since 2025-01-23
 * @requires WTS_Core
 */

/**
 * WTS CSRF Manager - Handles CSRF token capture, extraction, and management
 * This module provides comprehensive CSRF token handling capabilities including:
 * - Network request interception (XMLHttpRequest and fetch)
 * - Multi-method token extraction with debugging
 * - Token storage and expiration management
 * - Settings management for CSRF configuration
 * - Fallback token system
 */
class WTS_CSRFManager {
    /**
     * Initialize the CSRF Manager
     * @param {WTS_Core} core - Reference to WTS Core instance
     */
    constructor(core) {
        if (!core) {
            throw new Error('WTS_CSRFManager requires WTS_Core instance');
        }
        
        this.core = core;
        this.version = '1.0.0';
        this.name = 'WTS_CSRFManager';
        
        // Internal state
        this.capturedCSRFToken = null;
        this.networkInterceptionActive = false;
        this.originalXHRSetRequestHeader = null;
        this.originalFetch = null;
        
        // Configuration
        this.config = {
            tokenExpirationHours: 24,
            maxRetries: 3,
            retryDelayMs: 1000,
            useFallback: true,
            fallbackToken: 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==',
            headerName: 'anti-csrftoken-a2z',
            minTokenLength: 50
        };
        
        this.core.log(`${this.name} v${this.version} constructed`, 'debug');
    }

    // ==================== MODULE LIFECYCLE ====================

    /**
     * Initialize the CSRF Manager module
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            this.core.log(`Initializing ${this.name}...`, 'info');
            
            // Load configuration from storage
            await this._loadConfiguration();
            
            // Set up event listeners
            this._setupEventListeners();
            
            // Start network interception immediately
            this.startNetworkInterception();
            
            this.core.log(`${this.name} initialized successfully`, 'info');
            this.core.emit('csrf:manager-initialized', { version: this.version });
            
            return true;
        } catch (error) {
            this.core.log(`Failed to initialize ${this.name}: ${error.message}`, 'error');
            this.core.emit('csrf:manager-failed', { error: error.message });
            return false;
        }
    }

    /**
     * Cleanup the CSRF Manager
     */
    cleanup() {
        this.core.log(`Cleaning up ${this.name}...`, 'info');
        
        // Stop network interception
        this.stopNetworkInterception();
        
        // Clear captured token
        this.capturedCSRFToken = null;
        
        this.core.log(`${this.name} cleanup complete`, 'info');
        this.core.emit('csrf:manager-cleanup');
    }

    // ==================== CONFIGURATION MANAGEMENT ====================

    /**
     * Load configuration from storage
     * @private
     */
    async _loadConfiguration() {
        try {
            const storedConfig = await this.core.getValue('csrf_config', {});
            this.config = { ...this.config, ...storedConfig };
            
            this.core.log('CSRF configuration loaded', 'debug', this.config);
        } catch (error) {
            this.core.log(`Failed to load CSRF configuration: ${error.message}`, 'warn');
        }
    }

    /**
     * Save configuration to storage
     * @private
     */
    async _saveConfiguration() {
        try {
            await this.core.setValue('csrf_config', this.config);
            this.core.log('CSRF configuration saved', 'debug');
        } catch (error) {
            this.core.log(`Failed to save CSRF configuration: ${error.message}`, 'error');
        }
    }

    /**
     * Update configuration
     * @param {Object} newConfig - New configuration values
     * @returns {Promise<boolean>} Success status
     */
    async updateConfiguration(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            await this._saveConfiguration();
            
            this.core.log('CSRF configuration updated', 'info', newConfig);
            this.core.emit('csrf:config-updated', { config: this.config });
            
            return true;
        } catch (error) {
            this.core.log(`Failed to update CSRF configuration: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfiguration() {
        return { ...this.config };
    }

    // ==================== EVENT LISTENERS ====================

    /**
     * Set up event listeners
     * @private
     */
    _setupEventListeners() {
        // Listen for settings updates
        this.core.on('settings:updated', (data) => {
            if (data.section === 'csrf') {
                this.updateConfiguration(data.settings);
            }
        });
        
        // Listen for core cleanup
        this.core.on('core:cleanup', () => {
            this.cleanup();
        });
    }

    // ==================== NETWORK INTERCEPTION ====================

    /**
     * Start network request interception to capture CSRF tokens
     * @returns {boolean} Success status
     */
    startNetworkInterception() {
        if (this.networkInterceptionActive) {
            this.core.log('Network interception already active', 'debug');
            return true;
        }
        
        try {
            this.core.log('🌐 Starting network request interception for CSRF token capture...', 'info');
            this.networkInterceptionActive = true;

            // Intercept XMLHttpRequest
            this._interceptXMLHttpRequest();
            
            // Intercept fetch requests
            this._interceptFetch();

            this.core.log('✅ Network interception active - monitoring for CSRF tokens', 'info');
            this.core.emit('csrf:interception-started');
            
            return true;
        } catch (error) {
            this.core.log(`Failed to start network interception: ${error.message}`, 'error');
            this.networkInterceptionActive = false;
            return false;
        }
    }

    /**
     * Stop network request interception
     * @returns {boolean} Success status
     */
    stopNetworkInterception() {
        if (!this.networkInterceptionActive) {
            this.core.log('Network interception not active', 'debug');
            return true;
        }
        
        try {
            this.core.log('🛑 Stopping network request interception...', 'info');
            
            // Restore original XMLHttpRequest
            if (this.originalXHRSetRequestHeader) {
                XMLHttpRequest.prototype.setRequestHeader = this.originalXHRSetRequestHeader;
                this.originalXHRSetRequestHeader = null;
            }
            
            // Restore original fetch
            if (this.originalFetch) {
                window.fetch = this.originalFetch;
                this.originalFetch = null;
            }
            
            this.networkInterceptionActive = false;
            this.core.log('✅ Network interception stopped', 'info');
            this.core.emit('csrf:interception-stopped');
            
            return true;
        } catch (error) {
            this.core.log(`Failed to stop network interception: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Intercept XMLHttpRequest to capture CSRF tokens
     * @private
     */
    _interceptXMLHttpRequest() {
        this.originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        const self = this;
        
        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            if (name === self.config.headerName && value && value.length > self.config.minTokenLength) {
                self.core.log(`🎯 Captured CSRF token from XMLHttpRequest: ${value}`, 'info');
                self._handleCapturedToken(value, 'XMLHttpRequest');
            }
            return self.originalXHRSetRequestHeader.call(this, name, value);
        };
    }

    /**
     * Intercept fetch requests to capture CSRF tokens
     * @private
     */
    _interceptFetch() {
        this.originalFetch = window.fetch;
        const self = this;
        
        window.fetch = function(url, options) {
            if (options && options.headers) {
                const headers = options.headers;
                let csrfToken = null;
                
                // Check different header formats
                if (headers[self.config.headerName]) {
                    csrfToken = headers[self.config.headerName];
                } else if (headers.get && typeof headers.get === 'function') {
                    csrfToken = headers.get(self.config.headerName);
                }
                
                if (csrfToken && csrfToken.length > self.config.minTokenLength) {
                    self.core.log(`🎯 Captured CSRF token from fetch request: ${csrfToken}`, 'info');
                    self._handleCapturedToken(csrfToken, 'fetch');
                }
            }
            return self.originalFetch.apply(this, arguments);
        };
    }

    /**
     * Handle a captured CSRF token
     * @private
     * @param {string} token - The captured token
     * @param {string} source - Source of the token (XMLHttpRequest, fetch)
     */
    async _handleCapturedToken(token, source) {
        try {
            this.capturedCSRFToken = token;
            
            // Store token with timestamp
            await this.core.setValue('lastCapturedCSRFToken', token);
            await this.core.setValue('lastCapturedTimestamp', Date.now());
            
            this.core.log(`Token captured from ${source} and stored`, 'debug');
            this.core.emit('csrf:token-captured', { 
                token, 
                source, 
                timestamp: Date.now() 
            });
        } catch (error) {
            this.core.log(`Failed to handle captured token: ${error.message}`, 'error');
        }
    }

    // ==================== TOKEN RETRIEVAL ====================

    /**
     * Get the most recently captured token if still valid
     * @returns {Promise<string|null>} The captured token or null
     */
    async getCapturedToken() {
        try {
            const token = await this.core.getValue('lastCapturedCSRFToken', null);
            const timestamp = await this.core.getValue('lastCapturedTimestamp', 0);
            const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
            
            if (token && ageHours < this.config.tokenExpirationHours) {
                this.core.log(`🎯 Using captured CSRF token (${ageHours.toFixed(1)}h old): ${token}`, 'info');
                return token;
            }
            
            if (token) {
                this.core.log(`⚠️ Captured token is ${ageHours.toFixed(1)}h old, may be expired`, 'warn');
                this.core.emit('csrf:token-expired', { token, ageHours });
            }
            
            return null;
        } catch (error) {
            this.core.log(`Failed to get captured token: ${error.message}`, 'error');
            return null;
        }
    }

    // ==================== TOKEN EXTRACTION ====================

    /**
     * Extract CSRF token from the current page using multiple methods
     * @returns {string|null} The extracted token or null
     */
    extractCSRFToken() {
        this.core.log('=== CSRF Token Extraction Debug ===', 'debug');
        this.core.log(`Page readyState: ${document.readyState}`, 'debug');
        this.core.log(`URL: ${window.location.href}`, 'debug');
        this.core.log(`Timestamp: ${new Date().toISOString()}`, 'debug');
        
        // Method 1: Meta tag approach
        const metaToken = this._extractFromMetaTag();
        if (metaToken) return metaToken;
        
        // Method 2: Script content search
        const scriptToken = this._extractFromScripts();
        if (scriptToken) return scriptToken;
        
        // Method 3: Data attribute approach
        const dataToken = this._extractFromDataAttribute();
        if (dataToken) return dataToken;
        
        // Method 4: Window object search
        const windowToken = this._extractFromWindowObject();
        if (windowToken) return windowToken;
        
        // Method 5: Hidden input search
        const inputToken = this._extractFromHiddenInputs();
        if (inputToken) return inputToken;
        
        this.core.log('\n=== EXTRACTION FAILED ===', 'warn');
        this.core.log('❌ No CSRF token found using any method', 'warn');
        this.core.log('Suggestions:', 'info');
        this.core.log('1. Check if page is fully loaded', 'info');
        this.core.log('2. Try again after a delay', 'info');
        this.core.log('3. Check browser network tab for token in requests', 'info');
        this.core.log('4. Inspect page source manually for token location', 'info');
        
        this.core.emit('csrf:extraction-failed', { 
            url: window.location.href,
            readyState: document.readyState 
        });
        
        return null;
    }

    /**
     * Extract token from meta tag
     * @private
     * @returns {string|null} Token or null
     */
    _extractFromMetaTag() {
        this.core.log('\n--- Method 1: Meta Tag Search ---', 'debug');
        const metaToken = document.querySelector(`meta[name="${this.config.headerName}"]`);
        
        if (metaToken) {
            const token = metaToken.getAttribute('content');
            this.core.log(`✅ Found token in meta tag: ${token}`, 'info');
            this.core.log(`Token length: ${token.length}`, 'debug');
            this.core.log(`Token format valid: ${/^[A-Za-z0-9+/]+=*$/.test(token)}`, 'debug');
            return token;
        } else {
            this.core.log(`❌ No meta tag found with name='${this.config.headerName}'`, 'debug');
        }
        
        return null;
    }

    /**
     * Extract token from script content
     * @private
     * @returns {string|null} Token or null
     */
    _extractFromScripts() {
        this.core.log('\n--- Method 2: Script Content Search ---', 'debug');
        const scripts = document.querySelectorAll('script');
        this.core.log(`Total scripts found: ${scripts.length}`, 'debug');
        
        const regexPatterns = [
            {
                name: "Standard object notation",
                pattern: new RegExp(`["']${this.config.headerName}["']\\s*:\\s*["']([^"']+)["']`, 'g')
            },
            {
                name: "Flexible quotes and spacing",
                pattern: new RegExp(`["']${this.config.headerName}["']\\s*:\\s*["']([^"']*?)["']`, 'g')
            },
            {
                name: "With escaped characters",
                pattern: new RegExp(`["']${this.config.headerName}["']\\s*:\\s*["']([^"'\\\\]*(?:\\\\.[^"'\\\\]*)*)["']`, 'g')
            },
            {
                name: "Window object assignment",
                pattern: new RegExp(`window\\.[^=]*["']${this.config.headerName}["']\\s*:\\s*["']([^"']+)["']`, 'g')
            },
            {
                name: "Variable assignment",
                pattern: new RegExp(`(?:var|let|const)\\s+[^=]*=\\s*[^{]*["']${this.config.headerName}["']\\s*:\\s*["']([^"']+)["']`, 'g')
            }
        ];
        
        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i];
            const content = script.textContent || script.innerText;
            
            if (content.includes(this.config.headerName)) {
                this.core.log(`Script ${i + 1} contains '${this.config.headerName}'`, 'debug');
                this.core.log(`Script source: ${script.src || 'inline'}`, 'debug');
                this.core.log(`Content preview: ${content.substring(0, 200)}...`, 'debug');
                
                for (const {name, pattern} of regexPatterns) {
                    const matches = [...content.matchAll(pattern)];
                    if (matches.length > 0) {
                        const token = matches[0][1];
                        this.core.log(`✅ Found token using pattern '${name}': ${token}`, 'info');
                        this.core.log(`Token length: ${token.length}`, 'debug');
                        this.core.log(`Token format valid: ${/^[A-Za-z0-9+/]+=*$/.test(token)}`, 'debug');
                        return token;
                    }
                }
            }
        }
        
        this.core.log('❌ No token found in any script content', 'debug');
        return null;
    }

    /**
     * Extract token from data attribute
     * @private
     * @returns {string|null} Token or null
     */
    _extractFromDataAttribute() {
        this.core.log('\n--- Method 3: Data Attribute Search ---', 'debug');
        const tokenElement = document.querySelector(`[data-${this.config.headerName}]`);
        
        if (tokenElement) {
            const token = tokenElement.getAttribute(`data-${this.config.headerName}`);
            this.core.log(`✅ Found token in data attribute: ${token}`, 'info');
            this.core.log(`Element: ${tokenElement.tagName} ${tokenElement.id || tokenElement.className}`, 'debug');
            this.core.log(`Token length: ${token.length}`, 'debug');
            this.core.log(`Token format valid: ${/^[A-Za-z0-9+/]+=*$/.test(token)}`, 'debug');
            return token;
        } else {
            this.core.log(`❌ No element found with data-${this.config.headerName} attribute`, 'debug');
        }
        
        return null;
    }

    /**
     * Extract token from window object
     * @private
     * @returns {string|null} Token or null
     */
    _extractFromWindowObject() {
        this.core.log('\n--- Method 4: Window Object Search ---', 'debug');
        const windowChecks = [
            {
                name: "window.WholeFoodsConfig",
                check: () => window.WholeFoodsConfig && window.WholeFoodsConfig[this.config.headerName]
            },
            {
                name: "window.csrfToken",
                check: () => window.csrfToken
            },
            {
                name: `window['${this.config.headerName}']`,
                check: () => window[this.config.headerName]
            }
        ];
        
        for (const {name, check} of windowChecks) {
            try {
                const token = check();
                if (token) {
                    this.core.log(`✅ Found token in ${name}: ${token}`, 'info');
                    this.core.log(`Token length: ${token.length}`, 'debug');
                    this.core.log(`Token format valid: ${/^[A-Za-z0-9+/]+=*$/.test(token)}`, 'debug');
                    return token;
                } else {
                    this.core.log(`❌ ${name} not found or empty`, 'debug');
                }
            } catch (e) {
                this.core.log(`❌ Error checking ${name}: ${e.message}`, 'debug');
            }
        }
        
        return null;
    }

    /**
     * Extract token from hidden inputs
     * @private
     * @returns {string|null} Token or null
     */
    _extractFromHiddenInputs() {
        this.core.log('\n--- Method 5: Hidden Input Search ---', 'debug');
        const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
        this.core.log(`Hidden inputs found: ${hiddenInputs.length}`, 'debug');
        
        for (const input of hiddenInputs) {
            if (input.name && (input.name.includes('csrf') || input.name.includes('token'))) {
                this.core.log(`Found potential CSRF input: ${input.name} = ${input.value}`, 'debug');
                if (input.name === this.config.headerName || input.name === 'csrfToken') {
                    const token = input.value;
                    this.core.log(`✅ Found token in hidden input: ${token}`, 'info');
                    this.core.log(`Token length: ${token.length}`, 'debug');
                    this.core.log(`Token format valid: ${/^[A-Za-z0-9+/]+=*$/.test(token)}`, 'debug');
                    return token;
                }
            }
        }
        
        return null;
    }

    // ==================== FALLBACK TOKEN SYSTEM ====================

    /**
     * Get fallback CSRF token
     * @returns {Promise<string>} Fallback token
     */
    async getFallbackToken() {
        const fallbackToken = await this.core.getValue('fallbackCSRFToken', this.config.fallbackToken);
        this.core.log(`🔄 Using fallback CSRF token: ${fallbackToken}`, 'info');
        this.core.log(`Token length: ${fallbackToken.length}`, 'debug');
        this.core.log(`Token format valid: ${/^[A-Za-z0-9+/]+=*$/.test(fallbackToken)}`, 'debug');
        
        this.core.emit('csrf:fallback-used', { token: fallbackToken });
        return fallbackToken;
    }

    /**
     * Set a new fallback token
     * @param {string} token - New fallback token
     * @returns {Promise<boolean>} Success status
     */
    async setFallbackToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                throw new Error('Invalid fallback token');
            }
            
            await this.core.setValue('fallbackCSRFToken', token);
            this.config.fallbackToken = token;
            await this._saveConfiguration();
            
            this.core.log(`Fallback CSRF token updated: ${token}`, 'info');
            this.core.emit('csrf:fallback-updated', { token });
            
            return true;
        } catch (error) {
            this.core.log(`Failed to set fallback token: ${error.message}`, 'error');
            return false;
        }
    }

    // ==================== ENHANCED TOKEN EXTRACTION WITH RETRY ====================

    /**
     * Extract token with retry logic and fallback
     * @param {number} [maxRetries=3] - Maximum number of retry attempts
     * @param {number} [delayMs=1000] - Delay between retries in milliseconds
     * @returns {Promise<string|null>} The extracted token or null
     */
    async extractTokenWithRetry(maxRetries = null, delayMs = null) {
        const retries = maxRetries || this.config.maxRetries;
        const delay = delayMs || this.config.retryDelayMs;
        
        this.core.log(`\n🔄 CSRF Token Extraction Starting...`, 'info');
        
        // Priority 1: Check for recently captured token from network requests
        const capturedToken = await this.getCapturedToken();
        if (capturedToken) {
            this.core.log('✅ Using recently captured token from network requests', 'info');
            this.core.emit('csrf:token-found', { 
                token: capturedToken, 
                source: 'network-capture' 
            });
            return capturedToken;
        }
        
        // Priority 2: Try DOM extraction with retries
        for (let attempt = 1; attempt <= retries; attempt++) {
            this.core.log(`\n🔄 DOM Extraction Attempt ${attempt}/${retries}`, 'info');
            
            const token = this.extractCSRFToken();
            if (token) {
                this.core.log(`✅ Token found via DOM extraction on attempt ${attempt}`, 'info');
                this.core.emit('csrf:token-found', { 
                    token, 
                    source: 'dom-extraction',
                    attempt 
                });
                return token;
            }
            
            if (attempt < retries) {
                this.core.log(`⏳ Retrying DOM extraction in ${delay}ms...`, 'info');
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        this.core.log(`❌ All ${retries} DOM extraction attempts failed`, 'warn');
        
        // Priority 3: Check if fallback is enabled
        if (this.config.useFallback) {
            this.core.log('🔄 Attempting fallback token...', 'info');
            const fallbackToken = await this.getFallbackToken();
            this.core.emit('csrf:token-found', { 
                token: fallbackToken, 
                source: 'fallback' 
            });
            return fallbackToken;
        }
        
        this.core.log('❌ No CSRF token could be obtained', 'error');
        this.core.emit('csrf:token-not-found');
        return null;
    }

    // ==================== PUBLIC API METHODS ====================

    /**
     * Get the best available CSRF token
     * This is the main public method for getting tokens
     * @returns {Promise<string|null>} The best available token
     */
    async getToken() {
        return await this.extractTokenWithRetry();
    }

    /**
     * Force refresh of captured token by clearing stored values
     * @returns {Promise<boolean>} Success status
     */
    async refreshCapturedToken() {
        try {
            await this.core.deleteValue('lastCapturedCSRFToken');
            await this.core.deleteValue('lastCapturedTimestamp');
            this.capturedCSRFToken = null;
            
            this.core.log('Captured token cache cleared', 'info');
            this.core.emit('csrf:token-refreshed');
            
            return true;
        } catch (error) {
            this.core.log(`Failed to refresh captured token: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Get token extraction statistics
     * @returns {Promise<Object>} Statistics object
     */
    async getStatistics() {
        try {
            const lastCapturedTimestamp = await this.core.getValue('lastCapturedTimestamp', 0);
            const lastCapturedToken = await this.core.getValue('lastCapturedCSRFToken', null);
            
            return {
                networkInterceptionActive: this.networkInterceptionActive,
                lastCapturedTimestamp,
                lastCapturedToken: lastCapturedToken ? '***' + lastCapturedToken.slice(-10) : null,
                tokenAge: lastCapturedTimestamp ? (Date.now() - lastCapturedTimestamp) / (1000 * 60 * 60) : null,
                configuration: this.getConfiguration()
            };
        } catch (error) {
            this.core.log(`Failed to get statistics: ${error.message}`, 'error');
            return {};
        }
    }
}

// ==================== MODULE REGISTRATION ====================

/**
 * Create and register the CSRF Manager module
 * @param {WTS_Core} core - WTS Core instance
 * @returns {WTS_CSRFManager} The created module instance
 */
function createCSRFManager(core) {
    const csrfManager = new WTS_CSRFManager(core);
    
    // Register with core
    core.registerModule('WTS_CSRFManager', {
        version: csrfManager.version,
        dependencies: [], // No dependencies beyond core
        initialize: () => csrfManager.initialize(),
        cleanup: () => csrfManager.cleanup(),
        instance: csrfManager
    });
    
    return csrfManager;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WTS_CSRFManager, createCSRFManager };
} else if (typeof window !== 'undefined') {
    window.WTS_CSRFManager = WTS_CSRFManager;
    window.createCSRFManager = createCSRFManager;
    
    // Auto-register if WTSCore is available
    if (window.WTSCore) {
        window.WTSCSRFManager = createCSRFManager(window.WTSCore);
    }
}