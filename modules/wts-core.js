/**
 * WTS Core Module - Foundation module for the WTS userscript system
 * Provides event system, utilities, storage abstraction, and module lifecycle management
 * 
 * @author WTS Development Team
 * @version 1.0.0
 * @since 2025-01-22
 */

/**
 * WTS Core - The foundation module for the WTS userscript system
 * This module provides essential services that other modules depend on
 */
class WTS_Core {
    /**
     * Initialize the WTS Core system
     */
    constructor() {
        this.version = '1.0.0';
        this.modules = new Map();
        this.eventListeners = new Map();
        this.initialized = false;
        this.debugMode = false;
        
        // Initialize core systems
        this._initializeLogger();
        this._initializeStorage();
        this._initializeEventSystem();
        
        this.log('WTS Core initialized', 'info');
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize the core system
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            if (this.initialized) {
                this.log('WTS Core already initialized', 'warn');
                return true;
            }

            this.log('Initializing WTS Core system...', 'info');
            
            // Set up error handling
            this._setupErrorHandling();
            
            // Initialize storage system
            await this._initializeStorageSystem();
            
            this.initialized = true;
            this.emit('core:initialized', { version: this.version });
            this.log('WTS Core system initialized successfully', 'info');
            
            return true;
        } catch (error) {
            this.log(`Failed to initialize WTS Core: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Initialize the logging system
     * @private
     */
    _initializeLogger() {
        this.logger = {
            levels: {
                debug: 0,
                info: 1,
                warn: 2,
                error: 3
            },
            currentLevel: 1 // Default to info level
        };
    }

    /**
     * Initialize the storage system
     * @private
     */
    _initializeStorage() {
        this.storage = {
            cache: new Map(),
            prefix: 'wts_',
            // Add convenience methods that delegate to the core methods
            get: (key, defaultValue) => this.getValue(key, defaultValue),
            set: (key, value, options) => this.setValue(key, value, options),
            delete: (key) => this.deleteValue(key),
            clear: () => this.clearStorage(),
            keys: () => this.listKeys()
        };
    }

    /**
     * Initialize the event system
     * @private
     */
    _initializeEventSystem() {
        this.events = {
            maxListeners: 100,
            listenerCount: 0
        };
    }

    /**
     * Initialize storage system with GM functions
     * @private
     */
    async _initializeStorageSystem() {
        try {
            // Test if GM functions are available
            if (typeof GM_getValue !== 'undefined') {
                this.log('Tampermonkey GM functions available', 'debug');
            } else {
                this.log('GM functions not available, using fallback storage', 'warn');
            }
        } catch (error) {
            this.log(`Storage system initialization error: ${error.message}`, 'error');
        }
    }

    /**
     * Set up global error handling
     * @private
     */
    _setupErrorHandling() {
        // Capture unhandled errors
        if (typeof window !== 'undefined') {
            window.addEventListener('error', (event) => {
                this.log(`Unhandled error: ${event.error?.message || event.message}`, 'error');
                this.emit('core:error', { error: event.error, type: 'unhandled' });
            });

            window.addEventListener('unhandledrejection', (event) => {
                this.log(`Unhandled promise rejection: ${event.reason}`, 'error');
                this.emit('core:error', { error: event.reason, type: 'promise' });
            });
        }
    }

    // ==================== LOGGING SYSTEM ====================

    /**
     * Log a message with specified level
     * @param {string} message - The message to log
     * @param {string} level - Log level (debug, info, warn, error)
     * @param {Object} [context] - Additional context data
     */
    log(message, level = 'info', context = null) {
        const logLevel = this.logger.levels[level] || this.logger.levels.info;
        
        if (logLevel < this.logger.currentLevel && !this.debugMode) {
            return;
        }

        const timestamp = new Date().toISOString();
        const prefix = `[WTS-Core ${timestamp}] [${level.toUpperCase()}]`;
        const fullMessage = `${prefix} ${message}`;

        // Console output with appropriate method
        switch (level) {
            case 'debug':
                console.debug(fullMessage, context || '');
                break;
            case 'warn':
                console.warn(fullMessage, context || '');
                break;
            case 'error':
                console.error(fullMessage, context || '');
                break;
            default:
                console.log(fullMessage, context || '');
        }

        // Emit log event for other modules to listen (but avoid recursion)
        this._emitSilent('core:log', { message, level, timestamp, context });
    }

    /**
     * Set logging level
     * @param {string} level - New logging level
     */
    setLogLevel(level) {
        if (this.logger.levels.hasOwnProperty(level)) {
            this.logger.currentLevel = this.logger.levels[level];
            this.log(`Log level set to: ${level}`, 'info');
        } else {
            this.log(`Invalid log level: ${level}`, 'warn');
        }
    }

    /**
     * Enable or disable debug mode
     * @param {boolean} enabled - Debug mode status
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        this.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`, 'info');
    }

    // ==================== EVENT SYSTEM ====================

    /**
     * Add an event listener
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Callback function
     * @param {Object} [options] - Event options
     * @returns {string} Listener ID for removal
     */
    on(eventName, callback, options = {}) {
        if (!this._isValidCallback(callback)) {
            throw new Error('Callback must be a function');
        }

        if (this.events.listenerCount >= this.events.maxListeners) {
            this.log(`Maximum event listeners (${this.events.maxListeners}) reached`, 'warn');
        }

        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }

        const listenerId = this._generateListenerId();
        const listener = {
            id: listenerId,
            callback,
            once: options.once || false,
            priority: options.priority || 0
        };

        const listeners = this.eventListeners.get(eventName);
        listeners.push(listener);
        
        // Sort by priority (higher priority first)
        listeners.sort((a, b) => b.priority - a.priority);
        
        this.events.listenerCount++;
        this.log(`Event listener added for '${eventName}' (ID: ${listenerId})`, 'debug');
        
        return listenerId;
    }

    /**
     * Add a one-time event listener
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Callback function
     * @returns {string} Listener ID
     */
    once(eventName, callback) {
        return this.on(eventName, callback, { once: true });
    }

    /**
     * Remove an event listener
     * @param {string} eventName - Name of the event
     * @param {string} listenerId - ID of the listener to remove
     * @returns {boolean} Success status
     */
    off(eventName, listenerId) {
        if (!this.eventListeners.has(eventName)) {
            return false;
        }

        const listeners = this.eventListeners.get(eventName);
        const index = listeners.findIndex(listener => listener.id === listenerId);
        
        if (index !== -1) {
            listeners.splice(index, 1);
            this.events.listenerCount--;
            this.log(`Event listener removed for '${eventName}' (ID: ${listenerId})`, 'debug');
            
            if (listeners.length === 0) {
                this.eventListeners.delete(eventName);
            }
            
            return true;
        }
        
        return false;
    }

    /**
     * Emit an event
     * @param {string} eventName - Name of the event
     * @param {*} data - Data to pass to listeners
     * @returns {boolean} Success status
     */
    emit(eventName, data = null) {
        if (!this.eventListeners.has(eventName)) {
            this.log(`No listeners for event '${eventName}'`, 'debug');
            return false;
        }

        const listeners = this.eventListeners.get(eventName);
        const listenersToRemove = [];

        this.log(`Emitting event '${eventName}' to ${listeners.length} listeners`, 'debug');

        for (const listener of listeners) {
            try {
                listener.callback(data, eventName);
                
                if (listener.once) {
                    listenersToRemove.push(listener.id);
                }
            } catch (error) {
                this.log(`Error in event listener for '${eventName}': ${error.message}`, 'error');
                this.emit('core:listener-error', { eventName, error, listenerId: listener.id });
            }
        }

        // Remove one-time listeners
        listenersToRemove.forEach(id => this.off(eventName, id));

        return true;
    }

    /**
     * Emit an event silently (without logging debug messages to prevent recursion)
     * @param {string} eventName - Name of the event
     * @param {*} data - Data to pass to listeners
     * @returns {boolean} Success status
     * @private
     */
    _emitSilent(eventName, data = null) {
        if (!this.eventListeners.has(eventName)) {
            return false;
        }

        const listeners = this.eventListeners.get(eventName);
        const listenersToRemove = [];

        for (const listener of listeners) {
            try {
                listener.callback(data, eventName);
                
                if (listener.once) {
                    listenersToRemove.push(listener.id);
                }
            } catch (error) {
                // Use console.error directly to avoid recursion
                console.error(`[WTS-Core] Error in event listener for '${eventName}': ${error.message}`);
                this._emitSilent('core:listener-error', { eventName, error, listenerId: listener.id });
            }
        }

        // Remove one-time listeners
        listenersToRemove.forEach(id => this.off(eventName, id));

        return true;
    }

    /**
     * Remove all listeners for an event
     * @param {string} eventName - Name of the event
     */
    removeAllListeners(eventName) {
        if (this.eventListeners.has(eventName)) {
            const count = this.eventListeners.get(eventName).length;
            this.events.listenerCount -= count;
            this.eventListeners.delete(eventName);
            this.log(`Removed all ${count} listeners for event '${eventName}'`, 'debug');
        }
    }

    /**
     * Generate a unique listener ID
     * @private
     * @returns {string} Unique ID
     */
    _generateListenerId() {
        return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Validate callback function
     * @private
     * @param {*} callback - Callback to validate
     * @returns {boolean} Is valid
     */
    _isValidCallback(callback) {
        return typeof callback === 'function';
    }

    // ==================== STORAGE ABSTRACTION ====================

    /**
     * Store a value
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @param {Object} [options] - Storage options
     * @returns {Promise<boolean>} Success status
     */
    async setValue(key, value, options = {}) {
        try {
            const fullKey = this.storage.prefix + key;
            const serializedValue = JSON.stringify({
                value,
                timestamp: Date.now(),
                expires: options.expires || null
            });

            if (typeof GM_setValue !== 'undefined') {
                GM_setValue(fullKey, serializedValue);
            } else {
                // Fallback to localStorage
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(fullKey, serializedValue);
                } else {
                    // Memory storage as last resort
                    this.storage.cache.set(fullKey, serializedValue);
                }
            }

            this.log(`Value stored for key '${key}'`, 'debug');
            this.emit('storage:set', { key, value });
            return true;
        } catch (error) {
            this.log(`Failed to store value for key '${key}': ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Retrieve a value
     * @param {string} key - Storage key
     * @param {*} [defaultValue] - Default value if key not found
     * @returns {Promise<*>} Retrieved value
     */
    async getValue(key, defaultValue = null) {
        try {
            const fullKey = this.storage.prefix + key;
            let serializedValue = null;

            if (typeof GM_getValue !== 'undefined') {
                serializedValue = GM_getValue(fullKey, null);
            } else if (typeof localStorage !== 'undefined') {
                serializedValue = localStorage.getItem(fullKey);
            } else {
                serializedValue = this.storage.cache.get(fullKey) || null;
            }

            if (serializedValue === null) {
                this.log(`No value found for key '${key}', returning default`, 'debug');
                return defaultValue;
            }

            const parsed = JSON.parse(serializedValue);
            
            // Check expiration
            if (parsed.expires && Date.now() > parsed.expires) {
                this.log(`Value for key '${key}' has expired`, 'debug');
                await this.deleteValue(key);
                return defaultValue;
            }

            this.log(`Value retrieved for key '${key}'`, 'debug');
            this.emit('storage:get', { key, value: parsed.value });
            return parsed.value;
        } catch (error) {
            this.log(`Failed to retrieve value for key '${key}': ${error.message}`, 'error');
            return defaultValue;
        }
    }

    /**
     * Delete a value
     * @param {string} key - Storage key
     * @returns {Promise<boolean>} Success status
     */
    async deleteValue(key) {
        try {
            const fullKey = this.storage.prefix + key;

            if (typeof GM_deleteValue !== 'undefined') {
                GM_deleteValue(fullKey);
            } else if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(fullKey);
            } else {
                this.storage.cache.delete(fullKey);
            }

            this.log(`Value deleted for key '${key}'`, 'debug');
            this.emit('storage:delete', { key });
            return true;
        } catch (error) {
            this.log(`Failed to delete value for key '${key}': ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * List all keys with the WTS prefix
     * @returns {Promise<string[]>} Array of keys
     */
    async listKeys() {
        try {
            const keys = [];

            if (typeof GM_listValues !== 'undefined') {
                const allKeys = GM_listValues();
                keys.push(...allKeys.filter(key => key.startsWith(this.storage.prefix))
                    .map(key => key.substring(this.storage.prefix.length)));
            } else if (typeof localStorage !== 'undefined') {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(this.storage.prefix)) {
                        keys.push(key.substring(this.storage.prefix.length));
                    }
                }
            } else {
                for (const key of this.storage.cache.keys()) {
                    if (key.startsWith(this.storage.prefix)) {
                        keys.push(key.substring(this.storage.prefix.length));
                    }
                }
            }

            this.log(`Retrieved ${keys.length} storage keys`, 'debug');
            return keys;
        } catch (error) {
            this.log(`Failed to list storage keys: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Clear all WTS storage
     * @returns {Promise<boolean>} Success status
     */
    async clearStorage() {
        try {
            const keys = await this.listKeys();
            for (const key of keys) {
                await this.deleteValue(key);
            }
            
            this.log(`Cleared ${keys.length} storage entries`, 'info');
            this.emit('storage:clear', { count: keys.length });
            return true;
        } catch (error) {
            this.log(`Failed to clear storage: ${error.message}`, 'error');
            return false;
        }
    }

    // ==================== VALIDATION UTILITIES ====================

    /**
     * Validate that a value is not null or undefined
     * @param {*} value - Value to validate
     * @param {string} [name] - Name for error messages
     * @returns {boolean} Is valid
     */
    isNotEmpty(value, name = 'value') {
        if (value === null || value === undefined) {
            this.log(`Validation failed: ${name} is null or undefined`, 'warn');
            return false;
        }
        return true;
    }

    /**
     * Validate that a value is a string
     * @param {*} value - Value to validate
     * @param {string} [name] - Name for error messages
     * @returns {boolean} Is valid
     */
    isString(value, name = 'value') {
        if (typeof value !== 'string') {
            this.log(`Validation failed: ${name} is not a string`, 'warn');
            return false;
        }
        return true;
    }

    /**
     * Validate that a value is a number
     * @param {*} value - Value to validate
     * @param {string} [name] - Name for error messages
     * @returns {boolean} Is valid
     */
    isNumber(value, name = 'value') {
        if (typeof value !== 'number' || isNaN(value)) {
            this.log(`Validation failed: ${name} is not a valid number`, 'warn');
            return false;
        }
        return true;
    }

    /**
     * Validate that a value is a function
     * @param {*} value - Value to validate
     * @param {string} [name] - Name for error messages
     * @returns {boolean} Is valid
     */
    isFunction(value, name = 'value') {
        if (typeof value !== 'function') {
            this.log(`Validation failed: ${name} is not a function`, 'warn');
            return false;
        }
        return true;
    }

    /**
     * Validate that a value is an object
     * @param {*} value - Value to validate
     * @param {string} [name] - Name for error messages
     * @returns {boolean} Is valid
     */
    isObject(value, name = 'value') {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            this.log(`Validation failed: ${name} is not an object`, 'warn');
            return false;
        }
        return true;
    }

    // ==================== MODULE LIFECYCLE MANAGEMENT ====================

    /**
     * Register a module
     * @param {string} name - Module name
     * @param {Object} moduleDefinition - Module definition
     * @returns {boolean} Success status
     */
    registerModule(name, moduleDefinition) {
        try {
            if (!this.isString(name, 'module name') || !this.isObject(moduleDefinition, 'module definition')) {
                return false;
            }

            if (this.modules.has(name)) {
                this.log(`Module '${name}' is already registered`, 'warn');
                return false;
            }

            // Validate required module properties
            const requiredProps = ['version', 'initialize'];
            for (const prop of requiredProps) {
                if (!moduleDefinition.hasOwnProperty(prop)) {
                    this.log(`Module '${name}' missing required property: ${prop}`, 'error');
                    return false;
                }
            }

            if (!this.isFunction(moduleDefinition.initialize, 'module initialize function')) {
                return false;
            }

            const module = {
                name,
                ...moduleDefinition,
                status: 'registered',
                registeredAt: Date.now(),
                initializedAt: null,
                dependencies: moduleDefinition.dependencies || [],
                core: this // Provide core reference to modules
            };

            this.modules.set(name, module);
            this.log(`Module '${name}' registered successfully`, 'info');
            this.emit('module:registered', { name, module });
            
            return true;
        } catch (error) {
            this.log(`Failed to register module '${name}': ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Initialize a module
     * @param {string} name - Module name
     * @returns {Promise<boolean>} Success status
     */
    async initializeModule(name) {
        try {
            if (!this.modules.has(name)) {
                this.log(`Cannot initialize unregistered module '${name}'`, 'error');
                return false;
            }

            const module = this.modules.get(name);
            
            if (module.status === 'initialized') {
                this.log(`Module '${name}' is already initialized`, 'warn');
                return true;
            }

            // Check dependencies
            for (const dependency of module.dependencies) {
                if (!this.modules.has(dependency)) {
                    this.log(`Module '${name}' dependency '${dependency}' not found`, 'error');
                    return false;
                }
                
                const depModule = this.modules.get(dependency);
                if (depModule.status !== 'initialized') {
                    this.log(`Initializing dependency '${dependency}' for module '${name}'`, 'info');
                    const depResult = await this.initializeModule(dependency);
                    if (!depResult) {
                        this.log(`Failed to initialize dependency '${dependency}' for module '${name}'`, 'error');
                        return false;
                    }
                }
            }

            this.log(`Initializing module '${name}'...`, 'info');
            module.status = 'initializing';
            
            // Call module's initialize function
            const result = await module.initialize();
            
            if (result !== false) {
                module.status = 'initialized';
                module.initializedAt = Date.now();
                this.log(`Module '${name}' initialized successfully`, 'info');
                this.emit('module:initialized', { name, module });
                return true;
            } else {
                module.status = 'failed';
                this.log(`Module '${name}' initialization failed`, 'error');
                this.emit('module:failed', { name, module });
                return false;
            }
        } catch (error) {
            const module = this.modules.get(name);
            if (module) {
                module.status = 'failed';
            }
            this.log(`Error initializing module '${name}': ${error.message}`, 'error');
            this.emit('module:error', { name, error });
            return false;
        }
    }

    /**
     * Initialize all registered modules
     * @returns {Promise<Object>} Results object with success/failure counts
     */
    async initializeAllModules() {
        const results = {
            total: this.modules.size,
            success: 0,
            failed: 0,
            modules: {}
        };

        this.log(`Initializing ${results.total} registered modules...`, 'info');

        for (const [name] of this.modules) {
            const success = await this.initializeModule(name);
            results.modules[name] = success;
            
            if (success) {
                results.success++;
            } else {
                results.failed++;
            }
        }

        this.log(`Module initialization complete: ${results.success} success, ${results.failed} failed`, 'info');
        this.emit('modules:initialized', results);
        
        return results;
    }

    /**
     * Get module information
     * @param {string} name - Module name
     * @returns {Object|null} Module information
     */
    getModule(name) {
        return this.modules.get(name) || null;
    }

    /**
     * Get all registered modules
     * @returns {Object} Modules map as object
     */
    getAllModules() {
        const modules = {};
        for (const [name, module] of this.modules) {
            modules[name] = { ...module };
        }
        return modules;
    }

    /**
     * Unregister a module
     * @param {string} name - Module name
     * @returns {boolean} Success status
     */
    unregisterModule(name) {
        if (!this.modules.has(name)) {
            this.log(`Cannot unregister unknown module '${name}'`, 'warn');
            return false;
        }

        const module = this.modules.get(name);
        
        // Call cleanup if available
        if (typeof module.cleanup === 'function') {
            try {
                module.cleanup();
            } catch (error) {
                this.log(`Error during module '${name}' cleanup: ${error.message}`, 'error');
            }
        }

        this.modules.delete(name);
        this.log(`Module '${name}' unregistered`, 'info');
        this.emit('module:unregistered', { name });
        
        return true;
    }

    // ==================== ERROR HANDLING ====================

    /**
     * Handle errors with context
     * @param {Error} error - The error object
     * @param {string} context - Context where error occurred
     * @param {Object} [metadata] - Additional metadata
     */
    handleError(error, context, metadata = {}) {
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            context,
            timestamp: Date.now(),
            ...metadata
        };

        this.log(`Error in ${context}: ${error.message}`, 'error', errorInfo);
        this.emit('core:error', errorInfo);
    }

    /**
     * Create a safe wrapper for async functions
     * @param {Function} fn - Function to wrap
     * @param {string} context - Context for error reporting
     * @returns {Function} Wrapped function
     */
    safeAsync(fn, context) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.handleError(error, context, { args });
                return null;
            }
        };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get system information
     * @returns {Object} System information
     */
    getSystemInfo() {
        return {
            version: this.version,
            initialized: this.initialized,
            moduleCount: this.modules.size,
            eventListenerCount: this.events.listenerCount,
            debugMode: this.debugMode,
            timestamp: Date.now()
        };
    }

    /**
     * Cleanup core system
     */
    cleanup() {
        this.log('Cleaning up WTS Core system...', 'info');
        
        // Cleanup all modules
        for (const [name] of this.modules) {
            this.unregisterModule(name);
        }
        
        // Clear event listeners
        this.eventListeners.clear();
        this.events.listenerCount = 0;
        
        // Clear storage cache
        this.storage.cache.clear();
        
        this.initialized = false;
        this.log('WTS Core cleanup complete', 'info');
        this.emit('core:cleanup');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WTS_Core;
} else if (typeof window !== 'undefined') {
    // Always export the class, not an instance
    window.WTS_Core = WTS_Core;
    
    // For backward compatibility, also provide WTSCore as the class
    // The main script will create the instance when needed
    window.WTSCore = WTS_Core;
}