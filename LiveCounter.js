// ==UserScript==
// @name         WTS Live Counter Module
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Real-time ASIN counting and display for WTS
// @author       WTS-TM-Scripts
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/WTS-Shared.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';
    
    // Wait for WTS shared utilities to be ready
    if (typeof window.WTS === 'undefined') {
        setTimeout(arguments.callee, 100);
        return;
    }
    
    // Private module scope
    let counterElement = null;
    let isCountingActive = false;
    let currentCount = { visible: 0, empty: 0 };
    let updateInterval = null;
    let isInitialized = false;
    
    // Configuration
    const config = {
        updateIntervalMs: 1000, // Update every second
        observerConfig: {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-csa-c-item-id', 'class']
        },
        selectors: {
            asinCards: '[data-csa-c-type="item"][data-csa-c-item-type="asin"]',
            emptyCards: 'li.a-carousel-card.a-carousel-card-empty',
            carousels: '.a-carousel-container, [data-cel-widget*="carousel"]'
        }
    };
    
    // Private functions
    function createCounterDisplay() {
        WTS.shared.logger.log('LiveCounter', 'createCounterDisplay', 'Creating counter display element');
        
        counterElement = WTS.shared.utils.createElement('div', {
            id: 'wts-live-counter'
        }, {
            fontSize: '13px',
            color: '#333',
            marginTop: '8px',
            padding: '4px 0',
            borderTop: '1px solid #dee2e6',
            textAlign: 'center',
            backgroundColor: '#f8f9fa',
            borderRadius: '0 0 8px 8px',
            fontFamily: 'monospace'
        });
        
        updateCounterDisplay();
        
        WTS.shared.logger.log('LiveCounter', 'createCounterDisplay', 'Counter display created');
        return counterElement;
    }
    
    function updateCounterDisplay() {
        if (!counterElement) return;
        
        const { visible, empty } = currentCount;
        const total = visible + empty;
        
        // Create status indicator
        let statusIcon = '🔴'; // Default: not counting
        let statusText = 'Stopped';
        
        if (isCountingActive) {
            statusIcon = '🟢';
            statusText = 'Live';
        }
        
        counterElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 10px; color: #666;">${statusIcon} ${statusText}</span>
                <span><strong>ASINs:</strong> ${visible}</span>
                <span><strong>Empty:</strong> ${empty}</span>
            </div>
            <div style="font-size: 11px; color: #666; margin-top: 2px;">
                Total Cards: ${total} | Last Update: ${new Date().toLocaleTimeString()}
            </div>
        `;
        
        WTS.shared.logger.debug('LiveCounter', 'updateCounterDisplay', `Updated display: ${visible} ASINs, ${empty} empty`);
    }
    
    function countCurrentItems() {
        try {
            const asinCards = WTS.shared.utils.querySelectorAll(config.selectors.asinCards);
            const emptyCards = WTS.shared.utils.querySelectorAll(config.selectors.emptyCards);
            
            const newCount = {
                visible: asinCards.length,
                empty: emptyCards.length,
                timestamp: Date.now()
            };
            
            // Check if count has changed
            const hasChanged = newCount.visible !== currentCount.visible || newCount.empty !== currentCount.empty;
            
            if (hasChanged) {
                const previousCount = { ...currentCount };
                currentCount = newCount;
                
                WTS.shared.logger.debug('LiveCounter', 'countCurrentItems', 
                    `Count changed: ${previousCount.visible}→${newCount.visible} ASINs, ${previousCount.empty}→${newCount.empty} empty`);
                
                // Emit count change event
                WTS.shared.events.emit('liveCountUpdated', {
                    current: newCount,
                    previous: previousCount,
                    hasChanged: true
                });
                
                updateCounterDisplay();
            }
            
            return newCount;
            
        } catch (error) {
            WTS.shared.logger.error('LiveCounter', 'countCurrentItems', `Error counting items: ${error.message}`);
            return currentCount;
        }
    }
    
    function startCounting() {
        if (isCountingActive) {
            WTS.shared.logger.warn('LiveCounter', 'startCounting', 'Counting already active');
            return;
        }
        
        WTS.shared.logger.log('LiveCounter', 'startCounting', 'Starting live counting');
        
        isCountingActive = true;
        
        // Initial count
        countCurrentItems();
        
        // Set up periodic updates
        updateInterval = setInterval(() => {
            if (isCountingActive) {
                countCurrentItems();
            }
        }, config.updateIntervalMs);
        
        // Set up mutation observer for real-time updates
        setupMutationObserver();
        
        updateCounterDisplay();
        
        WTS.shared.events.emit('liveCountingStarted', currentCount);
        WTS.shared.logger.log('LiveCounter', 'startCounting', 'Live counting started successfully');
    }
    
    function stopCounting() {
        if (!isCountingActive) {
            WTS.shared.logger.warn('LiveCounter', 'stopCounting', 'Counting not active');
            return;
        }
        
        WTS.shared.logger.log('LiveCounter', 'stopCounting', 'Stopping live counting');
        
        isCountingActive = false;
        
        // Clear interval
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        
        // Destroy mutation observer
        WTS.shared.observers.destroy('liveCounter');
        
        updateCounterDisplay();
        
        WTS.shared.events.emit('liveCountingStopped', currentCount);
        WTS.shared.logger.log('LiveCounter', 'stopCounting', 'Live counting stopped');
    }
    
    function setupMutationObserver() {
        // Create throttled update function to prevent excessive updates
        const throttledUpdate = WTS.shared.performance.throttle(() => {
            if (isCountingActive) {
                countCurrentItems();
            }
        }, 500); // Throttle to max 2 updates per second
        
        const observerCallback = (mutations) => {
            let shouldUpdate = false;
            
            mutations.forEach(mutation => {
                // Check if the mutation affects ASIN cards or empty cards
                if (mutation.type === 'childList') {
                    // Check added nodes
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && (
                                node.matches(config.selectors.asinCards) ||
                                node.matches(config.selectors.emptyCards) ||
                                node.querySelector(config.selectors.asinCards) ||
                                node.querySelector(config.selectors.emptyCards)
                            )) {
                                shouldUpdate = true;
                            }
                        }
                    });
                    
                    // Check removed nodes
                    mutation.removedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && (
                                node.matches(config.selectors.asinCards) ||
                                node.matches(config.selectors.emptyCards) ||
                                node.querySelector(config.selectors.asinCards) ||
                                node.querySelector(config.selectors.emptyCards)
                            )) {
                                shouldUpdate = true;
                            }
                        }
                    });
                } else if (mutation.type === 'attributes') {
                    // Check if attribute changes affect ASIN identification
                    const target = mutation.target;
                    if (target.matches && (
                        target.matches(config.selectors.asinCards) ||
                        target.matches(config.selectors.emptyCards)
                    )) {
                        shouldUpdate = true;
                    }
                }
            });
            
            if (shouldUpdate) {
                WTS.shared.logger.debug('LiveCounter', 'mutationObserver', 'DOM changes detected, updating count');
                throttledUpdate();
            }
        };
        
        // Observe document body for changes
        WTS.shared.observers.create(
            document.body,
            config.observerConfig,
            observerCallback,
            'liveCounter'
        );
        
        WTS.shared.logger.log('LiveCounter', 'setupMutationObserver', 'Mutation observer set up for live counting');
    }
    
    function getCurrentCount() {
        return { ...currentCount };
    }
    
    function resetCount() {
        WTS.shared.logger.log('LiveCounter', 'resetCount', 'Resetting counter');
        
        currentCount = { visible: 0, empty: 0 };
        updateCounterDisplay();
        
        WTS.shared.events.emit('liveCountReset');
    }
    
    function getCountHistory() {
        // This could be extended to maintain a history of counts
        return [currentCount];
    }
    
    function setupEventListeners() {
        // Listen for data extraction events to sync counts
        WTS.shared.events.on('dataExtracted', (data) => {
            // Update our count to match extracted data
            const newCount = {
                visible: data.data.length,
                empty: data.emptyCount,
                timestamp: data.timestamp
            };
            
            if (newCount.visible !== currentCount.visible || newCount.empty !== currentCount.empty) {
                currentCount = newCount;
                updateCounterDisplay();
                
                WTS.shared.logger.debug('LiveCounter', 'dataExtracted', 'Count synced with extracted data');
            }
        });
        
        // Listen for page navigation or significant changes
        WTS.shared.events.on('pageChanged', () => {
            if (isCountingActive) {
                WTS.shared.logger.log('LiveCounter', 'pageChanged', 'Page changed, recounting items');
                setTimeout(() => countCurrentItems(), 1000); // Delay to allow page to load
            }
        });
    }
    
    // Public API
    WTS.modules.LiveCounter = {
        // Start live counting
        startCounting: function() {
            startCounting();
        },
        
        // Stop live counting
        stopCounting: function() {
            stopCounting();
        },
        
        // Toggle counting on/off
        toggleCounting: function() {
            if (isCountingActive) {
                stopCounting();
            } else {
                startCounting();
            }
            return isCountingActive;
        },
        
        // Get current count
        getCurrentCount: function() {
            return getCurrentCount();
        },
        
        // Force update count now
        updateCount: function() {
            return countCurrentItems();
        },
        
        // Reset counter
        resetCount: function() {
            resetCount();
        },
        
        // Get counter display element
        getCounterElement: function() {
            return counterElement;
        },
        
        // Create and return counter display
        createCounter: function() {
            if (!counterElement) {
                createCounterDisplay();
            }
            return counterElement;
        },
        
        // Check if counting is active
        isActive: function() {
            return isCountingActive;
        },
        
        // Get count history
        getHistory: function() {
            return getCountHistory();
        },
        
        // Update display manually
        updateDisplay: function() {
            updateCounterDisplay();
        },
        
        // Configure update interval
        setUpdateInterval: function(intervalMs) {
            if (intervalMs < 100) {
                WTS.shared.logger.warn('LiveCounter', 'setUpdateInterval', 'Minimum interval is 100ms');
                intervalMs = 100;
            }
            
            config.updateIntervalMs = intervalMs;
            
            // Restart interval if currently active
            if (isCountingActive && updateInterval) {
                clearInterval(updateInterval);
                updateInterval = setInterval(() => {
                    if (isCountingActive) {
                        countCurrentItems();
                    }
                }, config.updateIntervalMs);
            }
            
            WTS.shared.logger.log('LiveCounter', 'setUpdateInterval', `Update interval set to ${intervalMs}ms`);
        },
        
        // Get current configuration
        getConfig: function() {
            return { ...config };
        }
    };
    
    // Module initialization
    WTS.modules.LiveCounter.init = function() {
        if (isInitialized) {
            WTS.shared.logger.warn('LiveCounter', 'init', 'Module already initialized');
            return;
        }
        
        WTS.shared.logger.log('LiveCounter', 'init', 'Initializing Live Counter module');
        
        // Set up event listeners
        setupEventListeners();
        
        // Create counter display
        createCounterDisplay();
        
        // Perform initial count
        countCurrentItems();
        
        isInitialized = true;
        WTS.shared.logger.log('LiveCounter', 'init', 'Live Counter module initialized successfully');
        WTS.shared.events.emit('liveCounterReady');
    };
    
    // Auto-initialize when shared utilities are ready
    if (WTS.shared && WTS.shared.logger) {
        WTS.modules.LiveCounter.init();
    } else {
        WTS.shared.events.on('sharedReady', WTS.modules.LiveCounter.init);
    }
    
    WTS.shared.logger.log('LiveCounter', 'load', 'Live Counter module loaded successfully');
})();