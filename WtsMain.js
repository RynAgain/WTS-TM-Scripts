// ==UserScript==
// @name         Whole Foods ASIN Exporter with Store Mapping (Modular)
// @namespace    http://tampermonkey.net/
// @version      2.0.007
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
    /**
     * Check if all required modules are available with robust validation
     * Waits for actual module objects, not just their existence
     */
    async function checkModuleAvailability(maxWaitTime = 10000) {
        const requiredModules = [
            { name: 'WTS_Core', altName: 'WTSCore' }, // Handle namespace mismatch
            { name: 'WTS_CSRFManager' },
            { name: 'WTS_DataExtractor' },
            { name: 'WTS_ExportManager' },
            { name: 'WTS_StoreManager' },
            { name: 'WTS_UIManager' }
        ];
        
        const startTime = Date.now();
        let allModulesReady = false;
        
        while (!allModulesReady && (Date.now() - startTime) < maxWaitTime) {
            const availableModules = [];
            const missingModules = [];
            
            for (const moduleInfo of requiredModules) {
                const moduleName = moduleInfo.name;
                const altName = moduleInfo.altName;
                
                // Check primary name first, then alternative name
                let moduleFound = false;
                let actualModule = null;
                
                if (typeof window[moduleName] !== 'undefined') {
                    actualModule = window[moduleName];
                    moduleFound = true;
                } else if (altName && typeof window[altName] !== 'undefined') {
                    actualModule = window[altName];
                    moduleFound = true;
                    log(`Using alternative namespace: ${altName} for ${moduleName}`, 'info');
                }
                
                // Validate that it's actually a usable module (not just undefined)
                if (moduleFound && actualModule !== null && typeof actualModule !== 'undefined') {
                    // For classes, check if they're constructable
                    if (typeof actualModule === 'function' || typeof actualModule === 'object') {
                        availableModules.push(moduleName);
                    } else {
                        missingModules.push(`${moduleName} (invalid type: ${typeof actualModule})`);
                    }
                } else {
                    missingModules.push(moduleName);
                }
            }
            
            log(`Module availability check: ${availableModules.length}/${requiredModules.length} modules loaded`);
            
            if (missingModules.length === 0) {
                allModulesReady = true;
                log('All required modules are available ✅');
                return true;
            } else {
                log(`Still waiting for modules: ${missingModules.join(', ')}`, 'warn');
                // Wait a bit before checking again
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        log(`Module loading timeout after ${maxWaitTime}ms. Missing modules may cause initialization failure.`, 'error');
        return false;
    }
    
    /**
     * Initialize the WTS Core system
     */
    async function initializeCore() {
        try {
            log('Initializing WTS Core system...');
            
            // Handle namespace mismatch - try both WTS_Core and WTSCore
            let CoreClass = null;
            if (typeof window.WTS_Core !== 'undefined') {
                CoreClass = window.WTS_Core;
                log('Using WTS_Core class for initialization', 'info');
            } else if (typeof window.WTSCore !== 'undefined') {
                // If WTSCore is an instance, use its constructor, otherwise use it directly
                if (typeof window.WTSCore === 'object' && window.WTSCore.constructor) {
                    CoreClass = window.WTSCore.constructor;
                    log('Using WTSCore instance constructor for initialization', 'info');
                } else if (typeof window.WTSCore === 'function') {
                    CoreClass = window.WTSCore;
                    log('Using WTSCore class for initialization', 'info');
                } else {
                    // WTSCore is already an instance, use it directly
                    wtsCore = window.WTSCore;
                    log('Using existing WTSCore instance', 'info');
                }
            } else {
                throw new Error('Neither WTS_Core nor WTSCore is available');
            }
            
            // Create core instance if we don't already have one
            if (!wtsCore && CoreClass) {
                wtsCore = new CoreClass();
            }
            
            if (!wtsCore) {
                throw new Error('Failed to create or obtain WTS Core instance');
            }
            
            // Initialize core if it has an initialize method and isn't already initialized
            if (typeof wtsCore.initialize === 'function') {
                if (!wtsCore.initialized) {
                    const coreInitialized = await wtsCore.initialize();
                    if (!coreInitialized) {
                        throw new Error('Failed to initialize WTS Core');
                    }
                } else {
                    log('WTS Core already initialized, skipping initialization', 'info');
                }
            } else {
                log('WTS Core does not have initialize method, assuming ready', 'info');
            }
            
            log('WTS Core initialized successfully ✅');
            return true;
            
        } catch (error) {
            log(`Core initialization failed: ${error.message}`, 'error');
            return false;
        }
    }
    
    /**
     * Initialize all modules directly (bypassing core registration for now)
     */
    async function initializeModules() {
        try {
            log('Initializing modules directly...');
            
            // Store module instances on the core for easy access
            wtsCore.moduleInstances = {};
            
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
            
            // Initialize each module
            for (const moduleInfo of moduleInitOrder) {
                try {
                    log(`Initializing ${moduleInfo.name} (${moduleInfo.description})...`);
                    
                    // Create module instance with proper dependencies
                    let moduleInstance;
                    
                    // Handle modules that require specific dependencies
                    if (moduleInfo.name === 'WTS_StoreManager') {
                        // StoreManager needs CSRFManager instance
                        const csrfManager = wtsCore.moduleInstances['WTS_CSRFManager'];
                        if (!csrfManager) {
                            throw new Error('WTS_StoreManager requires WTS_CSRFManager to be initialized first');
                        }
                        moduleInstance = new moduleInfo.class(wtsCore, csrfManager);
                    } else {
                        // Standard initialization with just core
                        moduleInstance = new moduleInfo.class(wtsCore);
                    }
                    
                    // Store instance for later access in both places for compatibility
                    wtsCore.moduleInstances[moduleInfo.name] = moduleInstance;
                    
                    // Also register with the core's module system so getModule() works
                    if (typeof wtsCore.registerModule === 'function') {
                        wtsCore.registerModule(moduleInfo.name, moduleInstance);
                    } else {
                        // Fallback: directly add to modules Map
                        wtsCore.modules.set(moduleInfo.name, moduleInstance);
                    }
                    
                    // Initialize module
                    if (typeof moduleInstance.initialize === 'function') {
                        const initialized = await moduleInstance.initialize();
                        if (!initialized) {
                            throw new Error(`Failed to initialize ${moduleInfo.name}`);
                        }
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
            
            // Get module instances
            const csrfManager = wtsCore.moduleInstances['WTS_CSRFManager'];
            const dataExtractor = wtsCore.moduleInstances['WTS_DataExtractor'];
            const uiManager = wtsCore.moduleInstances['WTS_UIManager'];
            
            // CSRF Manager should already be intercepting (started in initialize)
            log('CSRF token interception already active ✅');
            
            // Start data monitoring if available
            if (dataExtractor && typeof dataExtractor.startMonitoring === 'function') {
                log('Starting ASIN data monitoring...');
                await dataExtractor.startMonitoring();
            }
            
            // Create and show the UI panel
            if (uiManager && typeof uiManager.createPanel === 'function') {
                log('Creating user interface...');
                await uiManager.createPanel();
            }
            
            // Start real-time updates if available
            if (uiManager && typeof uiManager.startRealTimeUpdates === 'function') {
                log('Starting real-time updates...');
                await uiManager.startRealTimeUpdates();
            }
            
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
        
        log(`❌ Initialization attempt ${initializationAttempts} failed: ${error.message}`, 'error');
        log(`Error stack: ${error.stack}`, 'error');
        
        // Provide detailed diagnostic information
        const diagnostics = await gatherDiagnosticInfo();
        log('Diagnostic information:', 'info');
        log(`- DOM Ready: ${diagnostics.domReady}`, 'info');
        log(`- Available modules: ${diagnostics.availableModules.join(', ') || 'none'}`, 'info');
        log(`- Missing modules: ${diagnostics.missingModules.join(', ') || 'none'}`, 'info');
        log(`- WTS_Core available: ${diagnostics.coreAvailable}`, 'info');
        log(`- WTSCore available: ${diagnostics.altCoreAvailable}`, 'info');
        
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            const retryDelay = INIT_RETRY_DELAY * initializationAttempts; // Exponential backoff
            log(`🔄 Retrying initialization in ${retryDelay}ms... (attempt ${initializationAttempts + 1}/${MAX_INIT_ATTEMPTS})`, 'warn');
            
            setTimeout(() => {
                initializeApplication();
            }, retryDelay);
        } else {
            log('💥 Maximum initialization attempts reached. WTS startup failed.', 'error');
            
            // Show detailed error information to user
            const errorDetails = `
WTS Initialization Failed

Attempt: ${initializationAttempts}/${MAX_INIT_ATTEMPTS}
Error: ${error.message}

Diagnostics:
• DOM Ready: ${diagnostics.domReady}
• Available Modules: ${diagnostics.availableModules.length}/${diagnostics.totalModules}
• Core Available: ${diagnostics.coreAvailable || diagnostics.altCoreAvailable}

This may be due to:
• Network connectivity issues loading remote modules
• Browser security restrictions
• Module loading race conditions
• Corrupted or missing module files

Check the browser console for detailed logs.
            `.trim();
            
            if (typeof alert !== 'undefined') {
                alert(errorDetails);
            }
            
            // Activate emergency fallback
            emergencyFallback();
        }
    }
    
    /**
     * Gather diagnostic information for troubleshooting
     */
    async function gatherDiagnosticInfo() {
        const requiredModuleNames = [
            'WTS_Core', 'WTS_CSRFManager', 'WTS_DataExtractor',
            'WTS_ExportManager', 'WTS_StoreManager', 'WTS_UIManager'
        ];
        
        const availableModules = [];
        const missingModules = [];
        
        for (const moduleName of requiredModuleNames) {
            if (typeof window[moduleName] !== 'undefined') {
                availableModules.push(moduleName);
            } else {
                missingModules.push(moduleName);
            }
        }
        
        return {
            domReady: document.readyState === 'complete',
            availableModules,
            missingModules,
            totalModules: requiredModuleNames.length,
            coreAvailable: typeof window.WTS_Core !== 'undefined',
            altCoreAvailable: typeof window.WTSCore !== 'undefined',
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Main initialization function
     */
    async function initializeApplication() {
        try {
            log('🚀 Starting WTS v2.0.0 initialization...');
            
            // Step 1: Wait for modules to be available with timeout
            log('Step 1: Checking module availability...');
            const modulesAvailable = await checkModuleAvailability(15000); // 15 second timeout
            if (!modulesAvailable) {
                throw new Error('Required modules are not available after timeout');
            }
            
            // Step 2: Initialize core system
            log('Step 2: Initializing core system...');
            const coreReady = await initializeCore();
            if (!coreReady) {
                throw new Error('Core initialization failed');
            }
            
            // Step 3: Initialize all modules
            log('Step 3: Initializing modules...');
            const modulesReady = await initializeModules();
            if (!modulesReady) {
                throw new Error('Module initialization failed');
            }
            
            // Step 4: Start application services
            log('Step 4: Starting application services...');
            const appStarted = await startApplication();
            if (!appStarted) {
                throw new Error('Application startup failed');
            }
            
            log('🎉 WTS initialization completed successfully!');
            
            // Clear the emergency fallback timer since we succeeded
            if (typeof fallbackTimer !== 'undefined') {
                clearTimeout(fallbackTimer);
                log('Emergency fallback timer cleared', 'info');
            }
            
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
