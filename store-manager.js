// ==UserScript==
// @name         WTS Store Manager
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Store mapping and switching functionality for WTS scripts
// @author       WTS-TM-Scripts
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    // Store Management Module
    let storeMappingData = new Map();

    window.WTSStoreManager = {
        get storeMappingData() { return storeMappingData; },

        // Load stored mappings from Tampermonkey storage
        loadStoredMappings() {
            try {
                const storedData = GM_getValue('storeMappingData', '{}');
                const parsedData = JSON.parse(storedData);
                storeMappingData.clear();
                Object.entries(parsedData).forEach(([storeCode, storeId]) => {
                    storeMappingData.set(storeCode, storeId);
                });
            } catch (error) {
                console.error('Error loading stored mappings:', error);
                storeMappingData.clear();
            }
        },

        // Save mappings to Tampermonkey storage
        saveStoredMappings() {
            try {
                const dataToStore = Object.fromEntries(storeMappingData);
                GM_setValue('storeMappingData', JSON.stringify(dataToStore));
            } catch (error) {
                console.error('Error saving mappings:', error);
            }
        },

        // Update store mappings with new data
        updateMappings(newMappings) {
            storeMappingData.clear();
            newMappings.forEach((storeId, storeCode) => {
                storeMappingData.set(storeCode, storeId);
            });
            this.saveStoredMappings();
        },

        // Get all store mappings
        getAllMappings() {
            return new Map(storeMappingData);
        },

        // Get store ID by store code
        getStoreId(storeCode) {
            return storeMappingData.get(storeCode);
        },

        // Check if store code exists
        hasStoreCode(storeCode) {
            return storeMappingData.has(storeCode);
        },

        // Get mapping count
        getMappingCount() {
            return storeMappingData.size;
        },

        // Store switching functionality
        async switchToStore(storeCode) {
            const storeId = storeMappingData.get(storeCode);
            if (!storeId) {
                throw new Error(`Store code ${storeCode} not found in mappings`);
            }

            // Get CSRF token using the CSRF manager
            const csrfToken = await window.WTSCSRFManager.extractTokenWithRetry();
            if (!csrfToken) {
                throw new Error('Unable to find CSRF token after multiple attempts and fallback is disabled.\n\nEnable fallback token in settings or refresh the page and try again.\n\nCheck the browser console for detailed debugging information.');
            }

            try {
                // Use the exact fetch pattern from StoreChangeExample.js
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
                if (!response.ok) {
                    throw new Error(`Server responded with status: ${response.status} ${response.statusText}`);
                }

                return {
                    success: true,
                    storeCode: storeCode,
                    storeId: storeId,
                    message: `Successfully switched to store ${storeCode} (ID: ${storeId})`
                };

            } catch (error) {
                console.error('Store switch error:', error);
                
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
        },

        // File upload handler for store mappings
        handleFileUpload(file) {
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

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const csvText = e.target.result;
                        const newMappings = window.WTSDataExtractor.parseCSV(csvText);
                        
                        // Update the store mapping data
                        this.updateMappings(newMappings);

                        resolve({
                            success: true,
                            count: storeMappingData.size,
                            fileName: file.name
                        });
                    } catch (error) {
                        reject(new Error(`Error parsing file: ${error.message}`));
                    }
                };

                reader.onerror = () => {
                    reject(new Error('Error reading file. Please try again.'));
                };

                reader.readAsText(file);
            });
        },

        // Get sorted store list for dropdown
        getSortedStoreList() {
            return Array.from(storeMappingData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        },

        // Initialize the store manager
        init() {
            this.loadStoredMappings();
        }
    };

    // Auto-initialize when loaded
    window.WTSStoreManager.init();

})();