// ==UserScript==
// @name         Whole Foods ASIN Exporter with Store Mapping mod
// @namespace    http://tampermonkey.net/
// @version      1.2.002
// @description  Export ASIN, Name, Section from visible cards on Whole Foods page with store mapping functionality
// @author       WTS-TM-Scripts
// @homepage     https://github.com/RynAgain/WTS-TM-Scripts
// @homepageURL  https://github.com/RynAgain/WTS-TM-Scripts
// @supportURL   https://github.com/RynAgain/WTS-TM-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.js
// @downloadURL  https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.js
// @match        *://*.wholefoodsmarket.com/*
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/csrf-manager.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/data-extractor.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/store-manager.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/ui-components.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    // Main WTS Script Entry Point
    console.log('🚀 WTS Main Script Loading...');

    // Verify all required modules are loaded
    const requiredModules = [
        'WTSCSRFManager',
        'WTSDataExtractor', 
        'WTSStoreManager',
        'WTSUIComponents'
    ];

    const missingModules = requiredModules.filter(module => !window[module]);
    
    if (missingModules.length > 0) {
        console.error('❌ Missing required modules:', missingModules);
        alert(`❌ WTS Script Error: Missing modules: ${missingModules.join(', ')}\n\nPlease ensure all script files are properly loaded.`);
        return;
    }

    console.log('✅ All required modules loaded successfully');

    // Initialize all modules in the correct order
    function initializeModules() {
        try {
            // 1. Initialize CSRF Manager first (starts network interception)
            console.log('🔧 Initializing CSRF Manager...');
            window.WTSCSRFManager.init();

            // 2. Initialize Data Extractor
            console.log('🔧 Initializing Data Extractor...');
            // Data extractor is stateless, no init needed

            // 3. Initialize Store Manager (loads stored mappings)
            console.log('🔧 Initializing Store Manager...');
            window.WTSStoreManager.init();

            // 4. Initialize UI Components (creates the control panel)
            console.log('🔧 Initializing UI Components...');
            window.WTSUIComponents.init();

            console.log('✅ All modules initialized successfully');

        } catch (error) {
            console.error('❌ Error during module initialization:', error);
            alert(`❌ WTS Script Error: Failed to initialize modules\n\n${error.message}`);
        }
    }

    // Wait for page to be ready before initializing
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeModules);
    } else {
        // DOM is already ready
        initializeModules();
    }

    // Additional initialization when window loads (for UI components that need full page load)
    window.addEventListener('load', () => {
        console.log('🎯 Page fully loaded, performing final setup...');
        
        // Ensure UI is properly initialized
        if (window.WTSUIComponents && typeof window.WTSUIComponents.addCardCounter === 'function') {
            // Card counter is already added in init, but we can refresh the store UI
            if (typeof window.WTSUIComponents.updateStoreUI === 'function') {
                window.WTSUIComponents.updateStoreUI();
            }
        }

        console.log('🎉 WTS Script fully initialized and ready!');
    });

    // Global error handler for the script
    window.addEventListener('error', (event) => {
        if (event.filename && event.filename.includes('WTS')) {
            console.error('❌ WTS Script Error:', event.error);
        }
    });

    // Expose a global status check function for debugging
    window.WTSStatus = function() {
        console.log('=== WTS Script Status ===');
        console.log('CSRF Manager:', window.WTSCSRFManager ? '✅ Loaded' : '❌ Missing');
        console.log('Data Extractor:', window.WTSDataExtractor ? '✅ Loaded' : '❌ Missing');
        console.log('Store Manager:', window.WTSStoreManager ? '✅ Loaded' : '❌ Missing');
        console.log('UI Components:', window.WTSUIComponents ? '✅ Loaded' : '❌ Missing');
        
        if (window.WTSStoreManager) {
            console.log('Store Mappings:', window.WTSStoreManager.getMappingCount());
        }
        
        if (window.WTSDataExtractor) {
            const cardData = window.WTSDataExtractor.getCurrentCardCount();
            console.log('Visible ASINs:', cardData.visibleCount);
            console.log('Empty Cards:', cardData.emptyCount);
        }
        
        console.log('========================');
    };

    console.log('💡 Type WTSStatus() in console to check script status');

})();
