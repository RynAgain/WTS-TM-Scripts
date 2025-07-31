// ==UserScript==
// @name         WTS Store Manager Module
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Store mapping and switching functionality for WTS
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
    let storeMappingData = new Map();
    let isInitialized = false;
    
    // Private functions
    function loadStoredMappings() {
        try {
            const storedData = WTS.shared.storage.get(WTS.shared.storage.keys.STORE_MAPPINGS, {});
            storeMappingData.clear();
            
            if (typeof storedData === 'object' && storedData !== null) {
                Object.entries(storedData).forEach(([storeCode, storeId]) => {
                    storeMappingData.set(storeCode, parseInt(storeId, 10));
                });
            }
            
            // Update shared state
            WTS.shared.state.stores.mappings = new Map(storeMappingData);
            
            WTS.shared.logger.log('StoreManager', 'loadStoredMappings', `Loaded ${storeMappingData.size} store mappings`);
        } catch (error) {
            WTS.shared.logger.error('StoreManager', 'loadStoredMappings', error.message);
            storeMappingData.clear();
        }
    }
    
    function saveStoredMappings() {
        try {
            const dataToStore = Object.fromEntries(storeMappingData);
            WTS.shared.storage.set(WTS.shared.storage.keys.STORE_MAPPINGS, dataToStore);
            
            // Update shared state
            WTS.shared.state.stores.mappings = new Map(storeMappingData);
            
            WTS.shared.logger.log('StoreManager', 'saveStoredMappings', `Saved ${storeMappingData.size} store mappings`);
            
            // Emit event for UI updates
            WTS.shared.events.emit('storeMappingsUpdated', {
                count: storeMappingData.size,
                mappings: new Map(storeMappingData)
            });
        } catch (error) {
            WTS.shared.logger.error('StoreManager', 'saveStoredMappings', error.message);
        }
    }
    
    function parseCSV(csvText) {
        WTS.shared.logger.log('StoreManager', 'parseCSV', 'Starting CSV parsing');
        
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            throw new Error('CSV file must contain at least a header row and one data row');
        }

        const header = lines[0].split(',').map(col => col.trim().replace(/"/g, ''));
        const storeCodeIndex = header.findIndex(col => col.toLowerCase() === 'storecode');
        const storeIdIndex = header.findIndex(col => col.toLowerCase() === 'storeid');

        if (storeCodeIndex === -1 || storeIdIndex === -1) {
            throw new Error('CSV must contain "StoreCode" and "StoreId" columns');
        }

        const mappings = new Map();
        const errors = [];

        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',').map(col => col.trim().replace(/"/g, ''));
            
            if (row.length < Math.max(storeCodeIndex, storeIdIndex) + 1) {
                errors.push(`Row ${i + 1}: Insufficient columns`);
                continue;
            }

            const storeCode = row[storeCodeIndex];
            const storeId = row[storeIdIndex];

            // Validate StoreCode (3 characters)
            if (!storeCode || storeCode.length !== 3) {
                errors.push(`Row ${i + 1}: StoreCode must be exactly 3 characters (got: "${storeCode}")`);
                continue;
            }

            // Validate StoreId (numeric)
            if (!storeId || isNaN(storeId) || !Number.isInteger(Number(storeId))) {
                errors.push(`Row ${i + 1}: StoreId must be a valid integer (got: "${storeId}")`);
                continue;
            }

            mappings.set(storeCode.toUpperCase(), parseInt(storeId, 10));
        }

        if (errors.length > 0) {
            throw new Error(`Validation errors:\n${errors.join('\n')}`);
        }

        if (mappings.size === 0) {
            throw new Error('No valid store mappings found in the file');
        }

        WTS.shared.logger.log('StoreManager', 'parseCSV', `Successfully parsed ${mappings.size} store mappings`);
        return mappings;
    }
    
    async function switchToStore(storeCode) {
        WTS.shared.logger.log('StoreManager', 'switchToStore', `Attempting to switch to store: ${storeCode}`);
        
        const storeId = storeMappingData.get(storeCode);
        if (!storeId) {
            const error = `Store code ${storeCode} not found in mappings`;
            WTS.shared.logger.error('StoreManager', 'switchToStore', error);
            throw new Error(error);
        }

        // Get CSRF token from CSRFSettings module
        let csrfToken = null;
        if (WTS.modules.CSRFSettings) {
            try {
                csrfToken = await WTS.modules.CSRFSettings.extractToken();
            } catch (error) {
                WTS.shared.logger.error('StoreManager', 'switchToStore', `CSRF token extraction failed: ${error.message}`);
            }
        }
        
        if (!csrfToken) {
            const error = 'Unable to obtain CSRF token for store switch';
            WTS.shared.logger.error('StoreManager', 'switchToStore', error);
            throw new Error(error);
        }

        WTS.shared.logger.log('StoreManager', 'switchToStore', 'Making store change request');
        
        // Emit event to notify UI of switch start
        WTS.shared.events.emit('storeSwitch', {
            status: 'starting',
            storeCode: storeCode,
            storeId: storeId
        });

        try {
            // Use the exact fetch pattern from the original script
            const response = await fetch("https://www.wholefoodsmarket.com/store-affinity", {
                headers: {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9",
                    "anti-csrftoken-a2z": csrfToken,
                    "content-type": "text/plain;charset=UTF-8",
                    "device-memory": "8",
                    "downlink": "10",
                    "dpr": "1.5",
                    "ect": "4g",
                    "rtt": "100",
                    "sec-ch-device-memory": "8",
                    "sec-ch-dpr": "1.5",
                    "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-ch-viewport-width": "448",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-origin",
                    "viewport-width": "448"
                },
                referrer: "https://www.wholefoodsmarket.com/",
                body: JSON.stringify({"storeId": storeId.toString()}),
                method: "PUT",
                mode: "cors",
                credentials: "include"
            });

            // Check if the request was successful
            if (response.ok) {
                WTS.shared.logger.log('StoreManager', 'switchToStore', `Successfully switched to store ${storeCode} (ID: ${storeId})`);
                
                // Update current store in shared state
                WTS.shared.state.stores.currentStore = {
                    code: storeCode,
                    id: storeId
                };
                
                // Save current store
                WTS.shared.storage.set(WTS.shared.storage.keys.CURRENT_STORE, {
                    code: storeCode,
                    id: storeId,
                    timestamp: Date.now()
                });
                
                // Emit success event
                WTS.shared.events.emit('storeSwitch', {
                    status: 'success',
                    storeCode: storeCode,
                    storeId: storeId
                });
                
                return {
                    success: true,
                    storeCode: storeCode,
                    storeId: storeId
                };
            } else {
                throw new Error(`Server responded with status: ${response.status} ${response.statusText}`);
            }

        } catch (error) {
            WTS.shared.logger.error('StoreManager', 'switchToStore', `Store switch failed: ${error.message}`);
            
            // Emit error event
            WTS.shared.events.emit('storeSwitch', {
                status: 'error',
                storeCode: storeCode,
                storeId: storeId,
                error: error.message
            });
            
            // Provide user-friendly error messages
            let errorMessage = 'Failed to switch store. ';
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage += 'Network error - please check your connection and try again.';
            } else if (error.message.includes('status:')) {
                errorMessage += error.message;
            } else {
                errorMessage += 'Please try again or refresh the page.';
            }
            
            throw new Error(errorMessage);
        }
    }
    
    function handleFileUpload(file) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            const fileName = file.name.toLowerCase();
            if (!fileName.endsWith('.csv')) {
                reject(new Error('Please select a CSV file (.csv extension required)'));
                return;
            }

            WTS.shared.logger.log('StoreManager', 'handleFileUpload', `Processing file: ${file.name}`);

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const csvText = e.target.result;
                    const newMappings = parseCSV(csvText);
                    
                    // Update the store mapping data
                    storeMappingData.clear();
                    newMappings.forEach((storeId, storeCode) => {
                        storeMappingData.set(storeCode, storeId);
                    });

                    // Save to persistent storage
                    saveStoredMappings();

                    WTS.shared.logger.log('StoreManager', 'handleFileUpload', `Successfully loaded ${storeMappingData.size} store mappings from ${file.name}`);
                    
                    resolve({
                        success: true,
                        count: storeMappingData.size,
                        fileName: file.name,
                        mappings: new Map(storeMappingData)
                    });
                } catch (error) {
                    WTS.shared.logger.error('StoreManager', 'handleFileUpload', `Error parsing file: ${error.message}`);
                    reject(error);
                }
            };

            reader.onerror = function() {
                const error = new Error('Error reading file. Please try again.');
                WTS.shared.logger.error('StoreManager', 'handleFileUpload', error.message);
                reject(error);
            };

            reader.readAsText(file);
        });
    }
    
    function getStoreList() {
        // Return sorted list of stores
        const sortedStores = Array.from(storeMappingData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        return sortedStores.map(([storeCode, storeId]) => ({
            code: storeCode,
            id: storeId,
            display: `${storeCode} (ID: ${storeId})`
        }));
    }
    
    function getCurrentStore() {
        return WTS.shared.state.stores.currentStore;
    }
    
    function clearMappings() {
        storeMappingData.clear();
        WTS.shared.storage.delete(WTS.shared.storage.keys.STORE_MAPPINGS);
        WTS.shared.state.stores.mappings.clear();
        
        WTS.shared.logger.log('StoreManager', 'clearMappings', 'All store mappings cleared');
        
        // Emit event for UI updates
        WTS.shared.events.emit('storeMappingsUpdated', {
            count: 0,
            mappings: new Map()
        });
    }
    
    // Public API
    WTS.modules.StoreManager = {
        // Load mappings from storage
        loadMappings: function() {
            loadStoredMappings();
            return new Map(storeMappingData);
        },
        
        // Save mappings to storage
        saveMappings: function(mappings) {
            if (mappings instanceof Map) {
                storeMappingData = new Map(mappings);
            } else if (typeof mappings === 'object') {
                storeMappingData = new Map(Object.entries(mappings));
            } else {
                throw new Error('Mappings must be a Map or Object');
            }
            
            saveStoredMappings();
            return storeMappingData.size;
        },
        
        // Switch to a specific store
        switchStore: function(storeCode) {
            return switchToStore(storeCode);
        },
        
        // Parse CSV file content
        parseCSV: function(csvText) {
            return parseCSV(csvText);
        },
        
        // Handle file upload
        uploadFile: function(file) {
            return handleFileUpload(file);
        },
        
        // Get list of all stores
        getStoreList: function() {
            return getStoreList();
        },
        
        // Get current store
        getCurrentStore: function() {
            return getCurrentStore();
        },
        
        // Get store count
        getStoreCount: function() {
            return storeMappingData.size;
        },
        
        // Check if store exists
        hasStore: function(storeCode) {
            return storeMappingData.has(storeCode);
        },
        
        // Get store ID by code
        getStoreId: function(storeCode) {
            return storeMappingData.get(storeCode);
        },
        
        // Add single store mapping
        addStore: function(storeCode, storeId) {
            if (!storeCode || storeCode.length !== 3) {
                throw new Error('StoreCode must be exactly 3 characters');
            }
            
            if (!storeId || isNaN(storeId) || !Number.isInteger(Number(storeId))) {
                throw new Error('StoreId must be a valid integer');
            }
            
            storeMappingData.set(storeCode.toUpperCase(), parseInt(storeId, 10));
            saveStoredMappings();
            
            WTS.shared.logger.log('StoreManager', 'addStore', `Added store mapping: ${storeCode} -> ${storeId}`);
        },
        
        // Remove store mapping
        removeStore: function(storeCode) {
            const removed = storeMappingData.delete(storeCode);
            if (removed) {
                saveStoredMappings();
                WTS.shared.logger.log('StoreManager', 'removeStore', `Removed store mapping: ${storeCode}`);
            }
            return removed;
        },
        
        // Clear all mappings
        clearMappings: function() {
            clearMappings();
        },
        
        // Get mappings as object
        getMappingsObject: function() {
            return Object.fromEntries(storeMappingData);
        },
        
        // Get mappings as Map
        getMappingsMap: function() {
            return new Map(storeMappingData);
        }
    };
    
    // Module initialization
    WTS.modules.StoreManager.init = function() {
        if (isInitialized) {
            WTS.shared.logger.warn('StoreManager', 'init', 'Module already initialized');
            return;
        }
        
        WTS.shared.logger.log('StoreManager', 'init', 'Initializing Store Manager module');
        
        // Load existing mappings from storage
        loadStoredMappings();
        
        // Load current store if available
        const currentStore = WTS.shared.storage.get(WTS.shared.storage.keys.CURRENT_STORE, null);
        if (currentStore) {
            WTS.shared.state.stores.currentStore = currentStore;
            WTS.shared.logger.log('StoreManager', 'init', `Current store: ${currentStore.code} (ID: ${currentStore.id})`);
        }
        
        isInitialized = true;
        WTS.shared.logger.log('StoreManager', 'init', 'Store Manager module initialized successfully');
        WTS.shared.events.emit('storeManagerReady');
    };
    
    // Auto-initialize when shared utilities are ready
    if (WTS.shared && WTS.shared.logger) {
        WTS.modules.StoreManager.init();
    } else {
        WTS.shared.events.on('sharedReady', WTS.modules.StoreManager.init);
    }
    
    WTS.shared.logger.log('StoreManager', 'load', 'Store Manager module loaded successfully');
})();