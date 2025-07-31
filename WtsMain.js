// ==UserScript==
// @name         Whole Foods ASIN Exporter with Store Mapping
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Export ASIN, Name, Section from visible cards on Whole Foods page with store mapping functionality - Modular Architecture
// @author       WTS-TM-Scripts
// @homepage     https://github.com/RynAgain/WTS-TM-Scripts
// @homepageURL  https://github.com/RynAgain/WTS-TM-Scripts
// @supportURL   https://github.com/RynAgain/WTS-TM-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/WtsMain.js
// @downloadURL  https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/WtsMain.js
// @match        *://*.wholefoodsmarket.com/*
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/WTS-Shared.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/CSRFSettings.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/StoreManager.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/DataExporter.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/MainUI.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/LiveCounter.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';
    
    // Wait for all modules to be loaded
    function waitForModules() {
        return new Promise((resolve) => {
            const checkModules = () => {
                if (typeof window.WTS !== 'undefined' && 
                    WTS.modules.CSRFSettings &&
                    WTS.modules.StoreManager &&
                    WTS.modules.DataExporter &&
                    WTS.modules.MainUI &&
                    WTS.modules.LiveCounter) {
                    resolve();
                } else {
                    setTimeout(checkModules, 100);
                }
            };
            checkModules();
        });
    }
    
    // Application state
    let isInitialized = false;
    let uiElements = {};
    
    // Initialize the application
    async function initializeApplication() {
        if (isInitialized) {
            WTS.shared.logger.warn('WtsMain', 'initializeApplication', 'Application already initialized');
            return;
        }
        
        WTS.shared.logger.log('WtsMain', 'initializeApplication', 'Starting application initialization');
        
        try {
            // Wait for all modules to be ready
            await waitForModulesReady();
            
            // Create main UI panel
            createMainInterface();
            
            // Set up application-level event listeners
            setupApplicationEvents();
            
            // Start live counter
            WTS.modules.LiveCounter.startCounting();
            
            isInitialized = true;
            WTS.shared.logger.log('WtsMain', 'initializeApplication', 'Application initialized successfully');
            
            // Emit application ready event
            WTS.shared.events.emit('applicationReady');
            
        } catch (error) {
            WTS.shared.logger.error('WtsMain', 'initializeApplication', `Initialization failed: ${error.message}`);
            WTS.shared.errorHandler.handle(error, 'Application Initialization');
        }
    }
    
    // Wait for all modules to be ready
    function waitForModulesReady() {
        return new Promise((resolve) => {
            const requiredModules = [
                'sharedReady',
                'csrfSettingsReady',
                'storeManagerReady',
                'dataExporterReady',
                'mainUIReady',
                'liveCounterReady'
            ];
            
            let readyModules = new Set();
            
            const checkAllReady = () => {
                if (readyModules.size === requiredModules.length) {
                    WTS.shared.logger.log('WtsMain', 'waitForModulesReady', 'All modules are ready');
                    resolve();
                }
            };
            
            // Listen for each module ready event
            requiredModules.forEach(eventName => {
                WTS.shared.events.once(eventName, () => {
                    readyModules.add(eventName);
                    WTS.shared.logger.debug('WtsMain', 'waitForModulesReady', `Module ready: ${eventName}`);
                    checkAllReady();
                });
            });
            
            // Check if any modules are already ready
            setTimeout(() => {
                // Force check in case some events were already fired
                if (WTS.shared && WTS.shared.logger) readyModules.add('sharedReady');
                checkAllReady();
            }, 100);
        });
    }
    
    // Create the main user interface
    function createMainInterface() {
        WTS.shared.logger.log('WtsMain', 'createMainInterface', 'Creating main user interface');
        
        // Create the main panel
        const panel = WTS.modules.MainUI.createPanel();
        
        // Create Export ASIN Data button
        uiElements.exportBtn = WTS.modules.MainUI.addButton({
            id: 'exportBtn',
            text: '📦 Export ASIN Data',
            backgroundColor: '#28a745',
            onClick: handleExportClick
        });
        
        // Create Refresh Data button
        uiElements.refreshBtn = WTS.modules.MainUI.addButton({
            id: 'refreshBtn',
            text: '🔄 Refresh Data',
            backgroundColor: '#007bff',
            onClick: handleRefreshClick
        });
        
        // Create Upload Store Mapping button
        uiElements.uploadBtn = WTS.modules.MainUI.addButton({
            id: 'uploadBtn',
            text: '📁 Upload Store Mapping',
            backgroundColor: '#6f42c1',
            onClick: handleUploadClick
        });
        
        // Create hidden file input for uploads
        uiElements.fileInput = WTS.shared.utils.createElement('input', {
            type: 'file',
            accept: '.csv',
            style: 'display: none'
        });
        
        uiElements.fileInput.addEventListener('change', handleFileSelect);
        WTS.modules.MainUI.addElement(uiElements.fileInput);
        
        // Create store status display
        uiElements.statusDiv = WTS.shared.utils.createElement('div', {}, {
            fontSize: '12px',
            color: '#666',
            textAlign: 'center',
            marginTop: '4px'
        });
        uiElements.statusDiv.textContent = 'Loading store mappings...';
        WTS.modules.MainUI.addElement(uiElements.statusDiv);
        
        // Create store selection container (initially hidden)
        createStoreSelectionUI();
        
        // Create CSRF Settings button
        uiElements.csrfSettingsBtn = WTS.modules.MainUI.addButton({
            id: 'csrfSettingsBtn',
            text: '⚙️ CSRF Settings',
            backgroundColor: '#6c757d',
            fontSize: '12px',
            padding: '8px',
            onClick: () => WTS.modules.CSRFSettings.showSettingsModal()
        });
        
        // Add live counter to the panel
        const counterElement = WTS.modules.LiveCounter.createCounter();
        WTS.modules.MainUI.addElement(counterElement);
        
        WTS.shared.logger.log('WtsMain', 'createMainInterface', 'Main interface created successfully');
    }
    
    // Create store selection UI
    function createStoreSelectionUI() {
        uiElements.storeContainer = WTS.shared.utils.createElement('div', {}, {
            display: 'none',
            marginTop: '8px'
        });
        
        const storeLabel = WTS.shared.utils.createElement('div', {}, {
            fontSize: '12px',
            color: '#333',
            marginBottom: '4px'
        });
        storeLabel.textContent = 'Switch Store:';
        
        uiElements.storeSelect = WTS.shared.utils.createElement('select', {}, {
            width: '100%',
            padding: '6px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            fontSize: '12px'
        });
        
        uiElements.switchBtn = WTS.modules.MainUI.addButton({
            id: 'switchStoreBtn',
            text: '🔄 Switch Store',
            backgroundColor: '#17a2b8',
            fontSize: '12px',
            padding: '8px',
            onClick: handleStoreSwitch
        });
        
        uiElements.storeContainer.appendChild(storeLabel);
        uiElements.storeContainer.appendChild(uiElements.storeSelect);
        
        WTS.modules.MainUI.addElement(uiElements.storeContainer);
    }
    
    // Event handlers
    async function handleExportClick() {
        WTS.shared.logger.log('WtsMain', 'handleExportClick', 'Export button clicked');
        
        try {
            // Update button state
            WTS.modules.MainUI.updateButtonState('exportBtn', {
                text: '📦 Exporting...',
                disabled: true
            });
            
            // Check if we have data, if not extract it
            let data = WTS.modules.DataExporter.getLastExtracted();
            if (!data || data.length === 0) {
                const result = WTS.modules.DataExporter.extractData();
                data = result.data;
                
                if (data.length === 0) {
                    alert('No ASIN cards found. Try scrolling or navigating through carousels.');
                    return;
                }
                
                alert(`${data.length} ASIN(s) found. ${result.emptyCount} empty card(s) detected.`);
            }
            
            // Download CSV
            const downloadResult = WTS.modules.DataExporter.downloadCSV(data);
            WTS.shared.logger.log('WtsMain', 'handleExportClick', `CSV downloaded: ${downloadResult.filename}`);
            
        } catch (error) {
            WTS.shared.logger.error('WtsMain', 'handleExportClick', `Export failed: ${error.message}`);
            alert(`Export failed: ${error.message}`);
        } finally {
            // Restore button state
            WTS.modules.MainUI.updateButtonState('exportBtn', {
                text: '📦 Export ASIN Data',
                disabled: false
            });
        }
    }
    
    function handleRefreshClick() {
        WTS.shared.logger.log('WtsMain', 'handleRefreshClick', 'Refresh button clicked');
        
        try {
            // Update button state
            WTS.modules.MainUI.updateButtonState('refreshBtn', {
                text: '🔄 Refreshing...',
                disabled: true
            });
            
            // Refresh data
            const result = WTS.modules.DataExporter.refreshData();
            alert(`🔄 Refreshed: ${result.data.length} ASIN(s) found. ${result.emptyCount} empty card(s) detected.`);
            
        } catch (error) {
            WTS.shared.logger.error('WtsMain', 'handleRefreshClick', `Refresh failed: ${error.message}`);
            alert(`Refresh failed: ${error.message}`);
        } finally {
            // Restore button state
            WTS.modules.MainUI.updateButtonState('refreshBtn', {
                text: '🔄 Refresh Data',
                disabled: false
            });
        }
    }
    
    function handleUploadClick() {
        WTS.shared.logger.log('WtsMain', 'handleUploadClick', 'Upload button clicked');
        uiElements.fileInput.click();
    }
    
    async function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        WTS.shared.logger.log('WtsMain', 'handleFileSelect', `File selected: ${file.name}`);
        
        try {
            // Update button state
            WTS.modules.MainUI.updateButtonState('uploadBtn', {
                text: '📁 Uploading...',
                disabled: true
            });
            
            // Upload file using StoreManager
            const result = await WTS.modules.StoreManager.uploadFile(file);
            
            alert(`✅ Successfully loaded ${result.count} store mappings from ${result.fileName}`);
            
            // Update UI
            updateStoreUI();
            
        } catch (error) {
            WTS.shared.logger.error('WtsMain', 'handleFileSelect', `Upload failed: ${error.message}`);
            alert(`❌ Error uploading file: ${error.message}`);
        } finally {
            // Restore button state
            WTS.modules.MainUI.updateButtonState('uploadBtn', {
                text: '📁 Upload Store Mapping',
                disabled: false
            });
            
            // Reset file input
            uiElements.fileInput.value = '';
        }
    }
    
    async function handleStoreSwitch() {
        const selectedStoreCode = uiElements.storeSelect.value;
        if (!selectedStoreCode) {
            alert('Please select a store to switch to');
            return;
        }
        
        WTS.shared.logger.log('WtsMain', 'handleStoreSwitch', `Switching to store: ${selectedStoreCode}`);
        
        try {
            const result = await WTS.modules.StoreManager.switchStore(selectedStoreCode);
            
            if (result.success) {
                alert(`✅ Successfully switched to store ${result.storeCode} (ID: ${result.storeId})`);
                
                // Wait a moment for the server to process the change, then refresh
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
            
        } catch (error) {
            WTS.shared.logger.error('WtsMain', 'handleStoreSwitch', `Store switch failed: ${error.message}`);
            alert(`❌ ${error.message}`);
        }
    }
    
    // Update store-related UI elements
    function updateStoreUI() {
        const storeCount = WTS.modules.StoreManager.getStoreCount();
        
        if (storeCount === 0) {
            uiElements.statusDiv.textContent = 'No store mappings loaded';
            uiElements.statusDiv.style.color = '#666';
            uiElements.storeContainer.style.display = 'none';
        } else {
            uiElements.statusDiv.textContent = `${storeCount} store mappings loaded`;
            uiElements.statusDiv.style.color = '#28a745';
            uiElements.storeContainer.style.display = 'block';
            
            // Update store dropdown
            updateStoreDropdown();
        }
    }
    
    // Update store dropdown options
    function updateStoreDropdown() {
        const storeList = WTS.modules.StoreManager.getStoreList();
        
        // Clear existing options
        uiElements.storeSelect.innerHTML = '<option value="">Select a store...</option>';
        
        // Add store options
        storeList.forEach(store => {
            const option = WTS.shared.utils.createElement('option', {
                value: store.code
            });
            option.textContent = store.display;
            uiElements.storeSelect.appendChild(option);
        });
        
        WTS.shared.logger.debug('WtsMain', 'updateStoreDropdown', `Updated dropdown with ${storeList.length} stores`);
    }
    
    // Set up application-level event listeners
    function setupApplicationEvents() {
        WTS.shared.logger.log('WtsMain', 'setupApplicationEvents', 'Setting up application event listeners');
        
        // Listen for store mappings updates
        WTS.shared.events.on('storeMappingsUpdated', (data) => {
            WTS.shared.logger.debug('WtsMain', 'storeMappingsUpdated', `Store mappings updated: ${data.count} stores`);
            updateStoreUI();
        });
        
        // Listen for live count updates
        WTS.shared.events.on('liveCountUpdated', (data) => {
            // Could update other UI elements based on count changes
            WTS.shared.logger.debug('WtsMain', 'liveCountUpdated', `Count updated: ${data.current.visible} ASINs`);
        });
        
        // Listen for data extraction events
        WTS.shared.events.on('dataExtracted', (data) => {
            WTS.shared.logger.debug('WtsMain', 'dataExtracted', `Data extracted: ${data.data.length} items`);
        });
        
        // Listen for CSRF token events
        WTS.shared.events.on('csrfTokenCaptured', (data) => {
            WTS.shared.logger.debug('WtsMain', 'csrfTokenCaptured', 'CSRF token captured from network');
        });
        
        // Listen for errors
        WTS.shared.events.on('error', (errorInfo) => {
            WTS.shared.logger.error('WtsMain', 'errorEvent', `Application error: ${errorInfo.message}`);
        });
        
        // Page visibility change handler
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                WTS.shared.logger.debug('WtsMain', 'visibilitychange', 'Page hidden - pausing live counter');
                WTS.modules.LiveCounter.stopCounting();
            } else {
                WTS.shared.logger.debug('WtsMain', 'visibilitychange', 'Page visible - resuming live counter');
                WTS.modules.LiveCounter.startCounting();
            }
        });
    }
    
    // Application cleanup
    function cleanup() {
        WTS.shared.logger.log('WtsMain', 'cleanup', 'Cleaning up application');
        
        // Stop live counter
        if (WTS.modules.LiveCounter) {
            WTS.modules.LiveCounter.stopCounting();
        }
        
        // Clean up shared resources
        if (WTS.shared && WTS.shared.cleanup) {
            WTS.shared.cleanup();
        }
    }
    
    // Initialize when DOM is ready
    function initialize() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', async () => {
                await waitForModules();
                await initializeApplication();
            });
        } else {
            // DOM already loaded
            waitForModules().then(() => {
                initializeApplication();
            });
        }
    }
    
    // Set up page unload cleanup
    window.addEventListener('beforeunload', cleanup);
    
    // Start the application
    initialize();
    
    // Global error handler for unhandled errors
    window.addEventListener('error', (event) => {
        if (window.WTS && WTS.shared && WTS.shared.errorHandler) {
            WTS.shared.errorHandler.handle(event.error, 'Global Error Handler');
        } else {
            console.error('WTS Global Error:', event.error);
        }
    });
    
    console.log('🚀 WTS Modular Application loaded successfully');
})();
