// ==UserScript==
// @name         Whole Foods ASIN Exporter with Store Mapping (Modular)
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Modular ASIN exporter with store mapping - lightweight orchestrator using WTS module system
// @author       WTS-TM-Scripts
// @homepage     https://github.com/RynAgain/WTS-TM-Scripts
// @homepageURL  https://github.com/RynAgain/WTS-TM-Scripts
// @supportURL   https://github.com/RynAgain/WTS-TM-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.js
// @downloadURL  https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/modules/wts-core.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/modules/wts-csrf-manager.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/modules/wts-data-extractor.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/modules/wts-export-manager.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/modules/wts-store-manager.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/modules/wts-ui-manager.js
// @match        *://*.wholefoodsmarket.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

/**
 * WTS Main Orchestrator - Version 2.0.0
 * 
 * This is the lightweight main script that orchestrates all WTS modules.
 * It has been completely refactored from a 1000+ line monolithic script
 * into a clean, modular architecture.
 * 
 * The orchestrator's responsibilities:
 * 1. Initialize the WTS Core system
 * 2. Wait for all required modules to be available
 * 3. Start CSRF token interception immediately
 * 4. Initialize and coordinate all modules
 * 5. Handle graceful error recovery
 * 
 * All the original functionality is preserved but now distributed
 * across specialized modules for better maintainability.
 */

(function() {
    'use strict';
    
    // Application state
    let wtsCore = null;
    let initializationAttempts = 0;
    const MAX_INIT_ATTEMPTS = 5;
    const INIT_RETRY_DELAY = 1000; // 1 second
    
    /**
     * Log messages with consistent formatting
     */
    function log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = `[WTS-Main-${level.toUpperCase()}] ${timestamp}:`;
        
        switch (level) {
            case 'error':
                console.error(prefix, message);
                break;
            case 'warn':
                console.warn(prefix, message);
                break;
            case 'debug':
                console.debug(prefix, message);
                break;
            default:
                console.log(prefix, message);
        }
    }
    
    /**
     * Check if all required modules are available
     */
    function checkModuleAvailability() {
        const requiredModules = [
            'WTS_Core',
            'WTS_CSRFManager', 
            'WTS_DataExtractor',
            'WTS_ExportManager',
            'WTS_StoreManager',
            'WTS_UIManager'
        ];
        
        const availableModules = [];
        const missingModules = [];
        
        for (const moduleName of requiredModules) {
            if (typeof window[moduleName] !== 'undefined') {
                availableModules.push(moduleName);
            } else {
                missingModules.push(moduleName);
            }
        }
        
        log(`Module availability check: ${availableModules.length}/${requiredModules.length} modules loaded`);
        
        if (missingModules.length > 0) {
            log(`Missing modules: ${missingModules.join(', ')}`, 'warn');
            return false;
        }
        
        log('All required modules are available ✅');
        return true;
    }
    
    /**
     * Initialize the WTS Core system
     */
    async function initializeCore() {
        try {
            log('Initializing WTS Core system...');
            
            // Create core instance
            wtsCore = new window.WTS_Core();
            
            // Initialize core
            const coreInitialized = await wtsCore.initialize();
            if (!coreInitialized) {
                throw new Error('Failed to initialize WTS Core');
            }
            
            log('WTS Core initialized successfully ✅');
            return true;
            
        } catch (error) {
            log(`Core initialization failed: ${error.message}`, 'error');
            return false;
        }
    }
    
    /**
     * Register and initialize all modules
     */
    async function initializeModules() {
        try {
            log('Registering and initializing modules...');
            
            // Module initialization order is important
            const moduleInitOrder = [
                {
                    name: 'WTS_CSRFManager',
                    class: window.WTS_CSRFManager,
                    description: 'CSRF token management'
                },
                {
                    name: 'WTS_DataExtractor', 
                    class: window.WTS_DataExtractor,
                    description: 'ASIN data extraction'
                },
                {
                    name: 'WTS_ExportManager',
                    class: window.WTS_ExportManager, 
                    description: 'CSV export functionality'
                },
                {
                    name: 'WTS_StoreManager',
                    class: window.WTS_StoreManager,
                    description: 'Store switching and mapping'
                },
                {
                    name: 'WTS_UIManager',
                    class: window.WTS_UIManager,
                    description: 'User interface orchestration'
                }
            ];
            
            // Register and initialize each module
            for (const moduleInfo of moduleInitOrder) {
                try {
                    log(`Initializing ${moduleInfo.name} (${moduleInfo.description})...`);
                    
                    // Create module instance
                    const moduleInstance = new moduleInfo.class(wtsCore);
                    
                    // Register with core
                    const registered = wtsCore.registerModule(moduleInfo.name, moduleInstance);
                    if (!registered) {
                        throw new Error(`Failed to register ${moduleInfo.name}`);
                    }
                    
                    // Initialize module
                    const initialized = await moduleInstance.initialize();
                    if (!initialized) {
                        throw new Error(`Failed to initialize ${moduleInfo.name}`);
                    }
                    
                    log(`${moduleInfo.name} initialized successfully ✅`);
                    
                } catch (error) {
                    log(`Failed to initialize ${moduleInfo.name}: ${error.message}`, 'error');
                    throw error;
                }
            }
            
            log('All modules initialized successfully ✅');
            return true;
            
        } catch (error) {
            log(`Module initialization failed: ${error.message}`, 'error');
            return false;
        }
    }
    
    /**
     * Start the application services
     */
    async function startApplication() {
        try {
            log('Starting WTS application services...');
            
            // Get module instances from core
            const csrfManager = wtsCore.modules.get('WTS_CSRFManager');
            const dataExtractor = wtsCore.modules.get('WTS_DataExtractor');
            const uiManager = wtsCore.modules.get('WTS_UIManager');
            
            // Start CSRF interception immediately (critical for store switching)
            log('Starting CSRF token interception...');
            await csrfManager.startInterception();
            
            // Start data monitoring
            log('Starting ASIN data monitoring...');
            await dataExtractor.startMonitoring();
            
            // Create and show the UI panel
            log('Creating user interface...');
            await uiManager.createPanel();
            
            // Start real-time updates
            log('Starting real-time updates...');
            await uiManager.startRealTimeUpdates();
            
            log('WTS application started successfully ✅');
            log('🎉 WTS v2.0.0 is now running with modular architecture!');
            
            return true;
            
        } catch (error) {
            log(`Application startup failed: ${error.message}`, 'error');
            return false;
        }
    }
    
    /**
     * Handle initialization errors with retry logic
     */
    async function handleInitializationError(error) {
        initializationAttempts++;
        
        log(`Initialization attempt ${initializationAttempts} failed: ${error.message}`, 'error');
        
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            log(`Retrying initialization in ${INIT_RETRY_DELAY}ms... (attempt ${initializationAttempts + 1}/${MAX_INIT_ATTEMPTS})`);
            
            setTimeout(() => {
                initializeApplication();
            }, INIT_RETRY_DELAY);
        } else {
            log('Maximum initialization attempts reached. WTS startup failed.', 'error');
            
            // Show user-friendly error message
            if (typeof alert !== 'undefined') {
                alert('❌ WTS failed to initialize after multiple attempts.\n\n' +
                      'This may be due to:\n' +
                      '• Missing or corrupted module files\n' +
                      '• Network connectivity issues\n' +
                      '• Browser compatibility problems\n\n' +
                      'Please refresh the page or check the browser console for details.');
            }
        }
    }
    
    /**
     * Main initialization function
     */
    async function initializeApplication() {
        try {
            log('🚀 Starting WTS v2.0.0 initialization...');
            
            // Check if modules are available
            if (!checkModuleAvailability()) {
                throw new Error('Required modules are not available');
            }
            
            // Initialize core system
            const coreReady = await initializeCore();
            if (!coreReady) {
                throw new Error('Core initialization failed');
            }
            
            // Initialize all modules
            const modulesReady = await initializeModules();
            if (!modulesReady) {
                throw new Error('Module initialization failed');
            }
            
            // Start application services
            const appStarted = await startApplication();
            if (!appStarted) {
                throw new Error('Application startup failed');
            }
            
            log('🎉 WTS initialization completed successfully!');
            
        } catch (error) {
            await handleInitializationError(error);
        }
    }
    
    /**
     * Wait for DOM to be ready, then initialize
     */
    function waitForDOMAndInitialize() {
        if (document.readyState === 'loading') {
            log('Waiting for DOM to be ready...');
            document.addEventListener('DOMContentLoaded', initializeApplication);
        } else {
            log('DOM is ready, starting initialization...');
            initializeApplication();
        }
    }
    
    /**
     * Emergency fallback - if modules fail to load, provide basic functionality
     */
    function emergencyFallback() {
        log('Activating emergency fallback mode...', 'warn');
        
        // Create a minimal UI to inform the user
        const fallbackPanel = document.createElement('div');
        fallbackPanel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff6b6b;
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: sans-serif;
            font-size: 14px;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        
        fallbackPanel.innerHTML = `
            <strong>⚠️ WTS Module Loading Failed</strong><br>
            <small>The modular WTS system could not initialize properly. 
            Please refresh the page or check your userscript manager.</small>
        `;
        
        document.body.appendChild(fallbackPanel);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (fallbackPanel.parentNode) {
                fallbackPanel.parentNode.removeChild(fallbackPanel);
            }
        }, 10000);
    }
    
    // Set up emergency fallback timer
    const fallbackTimer = setTimeout(emergencyFallback, 10000); // 10 seconds
    
    // Start the application
    log('WTS Main Orchestrator v2.0.0 loaded');
    waitForDOMAndInitialize();
    
    // Clear fallback timer if initialization succeeds
    const originalLog = log;
    log = function(message, level) {
        originalLog(message, level);
        
        // If we see the success message, clear the fallback timer
        if (message.includes('initialization completed successfully')) {
            clearTimeout(fallbackTimer);
        }
    };
    
})();
