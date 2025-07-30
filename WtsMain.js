// ==UserScript==
// @name         Whole Foods ASIN Exporter with Store Mapping mod
// @namespace    http://tampermonkey.net/
// @version      1.2.005
// @description  Export ASIN, Name, Section from visible cards on Whole Foods page with store mapping functionality
// @author       WTS-TM-Scripts
// @match        *://*.wholefoodsmarket.com/*
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/csrf-manager.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/data-extractor.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/store-manager.js
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/ui-components.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function () {
    'use strict';

    console.log('🚀 WTS Main Script Loading...');

    const requiredModules = [
        'WTSCSRFManager',
        'WTSDataExtractor',
        'WTSStoreManager',
        'WTSUIComponents'
    ];

    function waitForModules(modules, callback, maxWait = 3000) {
        const start = Date.now();
        (function check() {
            const missing = modules.filter(m => !window[m]);
            if (missing.length === 0) {
                callback();
            } else if (Date.now() - start > maxWait) {
                console.error('❌ Timed out waiting for modules:', missing);
                alert(`❌ WTS Script Error: Timed out waiting for modules: ${missing.join(', ')}`);
            } else {
                setTimeout(check, 50);
            }
        })();
    }

    function initializeModules() {
        try {
            console.log('🔧 Initializing CSRF Manager...');
            window.WTSCSRFManager.init();

            console.log('🔧 Initializing Store Manager...');
            window.WTSStoreManager.init();

            console.log('🔧 Initializing UI Components...');
            window.WTSUIComponents.init();

            console.log('✅ All modules initialized successfully');
        } catch (error) {
            console.error('❌ Error during module initialization:', error);
            alert(`❌ WTS Script Error: Failed to initialize modules\n\n${error.message}`);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () =>
            waitForModules(requiredModules, initializeModules)
        );
    } else {
        waitForModules(requiredModules, initializeModules);
    }

    window.addEventListener('load', () => {
        if (window.WTSUIComponents?.updateStoreUI) {
            window.WTSUIComponents.updateStoreUI();
        }
    });

    window.addEventListener('error', (event) => {
        if (event.filename?.includes('WTS')) {
            console.error('❌ WTS Script Error:', event.error);
        }
    });

    window.WTSStatus = function () {
        console.log('=== WTS Script Status ===');
        requiredModules.forEach(m =>
            console.log(`${m}:`, window[m] ? '✅ Loaded' : '❌ Missing')
        );

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
