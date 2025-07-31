// ==UserScript==
// @name         WTS Shared Utilities
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Shared utilities and namespace infrastructure for WTS modules
// @author       WTS-TM-Scripts
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';
    
    // Initialize global WTS namespace
    if (typeof window.WTS === 'undefined') {
        window.WTS = {
            modules: {},
            shared: {},
            version: '1.0.0'
        };
    }
    
    // Shared utilities namespace
    WTS.shared = {
        // Storage abstraction layer
        storage: {
            keys: {
                // CSRF related
                CSRF_TOKEN: 'wts_csrf_captured_token',
                CSRF_TIMESTAMP: 'wts_csrf_timestamp',
                CSRF_FALLBACK: 'wts_csrf_fallback_token',
                CSRF_USE_FALLBACK: 'wts_csrf_use_fallback',
                
                // Store mapping
                STORE_MAPPINGS: 'wts_store_mappings',
                CURRENT_STORE: 'wts_current_store',
                
                // UI state
                PANEL_POSITION: 'wts_panel_position',
                PANEL_VISIBLE: 'wts_panel_visible',
                
                // Export data
                LAST_EXPORT_DATA: 'wts_last_export_data',
                EXPORT_SETTINGS: 'wts_export_settings'
            },
            
            set: function(key, value) {
                try {
                    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
                    GM_setValue(key, serializedValue);
                    WTS.shared.logger.log('Storage', 'set', `Key: ${key}`);
                    return true;
                } catch (error) {
                    WTS.shared.logger.error('Storage', 'set', `Key: ${key}, Error: ${error.message}`);
                    return false;
                }
            },
            
            get: function(key, defaultValue = null) {
                try {
                    const value = GM_getValue(key, null);
                    if (value === null) return defaultValue;
                    
                    // Try to parse as JSON, fallback to string
                    try {
                        return JSON.parse(value);
                    } catch (parseError) {
                        return value;
                    }
                } catch (error) {
                    WTS.shared.logger.error('Storage', 'get', `Key: ${key}, Error: ${error.message}`);
                    return defaultValue;
                }
            },
            
            delete: function(key) {
                try {
                    GM_deleteValue(key);
                    WTS.shared.logger.log('Storage', 'delete', `Key: ${key}`);
                    return true;
                } catch (error) {
                    WTS.shared.logger.error('Storage', 'delete', `Key: ${key}, Error: ${error.message}`);
                    return false;
                }
            }
        },
        
        // Standardized logging system
        logger: {
            log: function(fileName, functionName, message) {
                console.log(`[${fileName}] [${functionName}] ${message}`);
            },
            
            error: function(fileName, functionName, message) {
                console.error(`[${fileName}] [${functionName}] ERROR: ${message}`);
            },
            
            warn: function(fileName, functionName, message) {
                console.warn(`[${fileName}] [${functionName}] WARNING: ${message}`);
            },
            
            debug: function(fileName, functionName, message) {
                if (WTS.shared.config && WTS.shared.config.debugMode) {
                    console.debug(`[${fileName}] [${functionName}] DEBUG: ${message}`);
                }
            }
        },
        
        // Event system for module communication
        events: {
            listeners: {},
            
            emit: function(event, data) {
                WTS.shared.logger.debug('Events', 'emit', `Event: ${event}`);
                if (this.listeners[event]) {
                    this.listeners[event].forEach(callback => {
                        try {
                            callback(data);
                        } catch (error) {
                            WTS.shared.logger.error('Events', 'emit', `Event: ${event}, Error: ${error.message}`);
                        }
                    });
                }
            },
            
            on: function(event, callback) {
                if (!this.listeners[event]) {
                    this.listeners[event] = [];
                }
                this.listeners[event].push(callback);
                WTS.shared.logger.debug('Events', 'on', `Registered listener for: ${event}`);
            },
            
            off: function(event, callback) {
                if (this.listeners[event]) {
                    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
                    WTS.shared.logger.debug('Events', 'off', `Removed listener for: ${event}`);
                }
            },
            
            once: function(event, callback) {
                const onceCallback = (data) => {
                    callback(data);
                    this.off(event, onceCallback);
                };
                this.on(event, onceCallback);
            }
        },
        
        // Shared state management
        state: {
            // CSRF token state
            csrf: {
                capturedToken: null,
                lastCaptured: null,
                fallbackToken: null,
                useFallback: true
            },
            
            // Store mapping state
            stores: {
                mappings: new Map(),
                currentStore: null
            },
            
            // Export data state
            export: {
                lastExtracted: [],
                lastCount: 0
            },
            
            // UI state
            ui: {
                panelPosition: { x: 10, y: 10 },
                panelVisible: true,
                panelElement: null
            }
        },
        
        // Mutation observer management
        observers: {
            active: new Map(),
            
            create: function(target, config, callback, name) {
                // Disconnect existing observer with same name
                if (this.active.has(name)) {
                    this.destroy(name);
                }
                
                const observer = new MutationObserver(callback);
                observer.observe(target, config);
                this.active.set(name, observer);
                WTS.shared.logger.log('Observers', 'create', `Observer '${name}' created`);
                return observer;
            },
            
            destroy: function(name) {
                const observer = this.active.get(name);
                if (observer) {
                    observer.disconnect();
                    this.active.delete(name);
                    WTS.shared.logger.log('Observers', 'destroy', `Observer '${name}' destroyed`);
                    return true;
                }
                return false;
            },
            
            destroyAll: function() {
                this.active.forEach((observer, name) => {
                    observer.disconnect();
                    WTS.shared.logger.log('Observers', 'destroyAll', `Observer '${name}' destroyed`);
                });
                this.active.clear();
            }
        },
        
        // Performance utilities
        performance: {
            throttle: function(func, delay) {
                let timeoutId;
                let lastExecTime = 0;
                return function (...args) {
                    const currentTime = Date.now();
                    
                    if (currentTime - lastExecTime > delay) {
                        func.apply(this, args);
                        lastExecTime = currentTime;
                    } else {
                        clearTimeout(timeoutId);
                        timeoutId = setTimeout(() => {
                            func.apply(this, args);
                            lastExecTime = Date.now();
                        }, delay - (currentTime - lastExecTime));
                    }
                };
            },
            
            debounce: function(func, delay) {
                let timeoutId;
                return function (...args) {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => func.apply(this, args), delay);
                };
            }
        },
        
        // Error handling system
        errorHandler: {
            handle: function(error, context) {
                const errorInfo = {
                    message: error.message,
                    stack: error.stack,
                    context: context,
                    timestamp: new Date().toISOString(),
                    url: window.location.href
                };
                
                WTS.shared.logger.error('ErrorHandler', 'handle', JSON.stringify(errorInfo));
                
                // Store error for debugging
                WTS.shared.storage.set('wts_last_error', errorInfo);
                
                // Emit error event for modules to handle
                WTS.shared.events.emit('error', errorInfo);
                
                return errorInfo;
            }
        },
        
        // Common utilities
        utils: {
            // Generate unique IDs
            generateId: function(prefix = 'wts') {
                return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            },
            
            // Safe DOM element creation
            createElement: function(tag, attributes = {}, styles = {}) {
                const element = document.createElement(tag);
                
                // Set attributes
                Object.entries(attributes).forEach(([key, value]) => {
                    element.setAttribute(key, value);
                });
                
                // Set styles
                Object.entries(styles).forEach(([key, value]) => {
                    element.style[key] = value;
                });
                
                return element;
            },
            
            // Safe element selection
            querySelector: function(selector, context = document) {
                try {
                    return context.querySelector(selector);
                } catch (error) {
                    WTS.shared.logger.error('Utils', 'querySelector', `Invalid selector: ${selector}`);
                    return null;
                }
            },
            
            querySelectorAll: function(selector, context = document) {
                try {
                    return context.querySelectorAll(selector);
                } catch (error) {
                    WTS.shared.logger.error('Utils', 'querySelectorAll', `Invalid selector: ${selector}`);
                    return [];
                }
            },
            
            // Validate email format
            isValidEmail: function(email) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailRegex.test(email);
            },
            
            // Format file size
            formatFileSize: function(bytes) {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            },
            
            // Deep clone object
            deepClone: function(obj) {
                if (obj === null || typeof obj !== 'object') return obj;
                if (obj instanceof Date) return new Date(obj.getTime());
                if (obj instanceof Array) return obj.map(item => this.deepClone(item));
                if (typeof obj === 'object') {
                    const clonedObj = {};
                    Object.keys(obj).forEach(key => {
                        clonedObj[key] = this.deepClone(obj[key]);
                    });
                    return clonedObj;
                }
            }
        },
        
        // Configuration
        config: {
            debugMode: false,
            version: '1.0.0',
            updateCheckInterval: 24 * 60 * 60 * 1000, // 24 hours
            maxRetries: 3,
            defaultDelay: 1000
        }
    };
    
    // Global error handler
    window.addEventListener('error', (event) => {
        WTS.shared.errorHandler.handle(event.error, 'Global Error');
    });
    
    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
        WTS.shared.errorHandler.handle(event.reason, 'Unhandled Promise Rejection');
    });
    
    // Initialize shared state from storage
    WTS.shared.init = function() {
        WTS.shared.logger.log('WTS-Shared', 'init', 'Initializing shared utilities');
        
        // Load UI state
        const savedPosition = WTS.shared.storage.get(WTS.shared.storage.keys.PANEL_POSITION, { x: 10, y: 10 });
        WTS.shared.state.ui.panelPosition = savedPosition;
        
        // Load CSRF settings
        WTS.shared.state.csrf.fallbackToken = WTS.shared.storage.get(
            WTS.shared.storage.keys.CSRF_FALLBACK, 
            'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw=='
        );
        WTS.shared.state.csrf.useFallback = WTS.shared.storage.get(WTS.shared.storage.keys.CSRF_USE_FALLBACK, true);
        
        WTS.shared.logger.log('WTS-Shared', 'init', 'Shared utilities initialized successfully');
        WTS.shared.events.emit('sharedReady');
    };
    
    // Cleanup function
    WTS.shared.cleanup = function() {
        WTS.shared.logger.log('WTS-Shared', 'cleanup', 'Cleaning up shared resources');
        
        // Destroy all observers
        WTS.shared.observers.destroyAll();
        
        // Clear event listeners
        WTS.shared.events.listeners = {};
        
        WTS.shared.logger.log('WTS-Shared', 'cleanup', 'Cleanup completed');
    };
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', WTS.shared.init);
    } else {
        WTS.shared.init();
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', WTS.shared.cleanup);
    
    WTS.shared.logger.log('WTS-Shared', 'load', 'WTS Shared utilities loaded successfully');
})();