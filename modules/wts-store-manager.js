/**
 * WTS Store Manager Module - Handles store operations and mapping
 * Provides store mapping data persistence, CSV parsing, store switching API calls, and store selection management
 * 
 * @author WTS Development Team
 * @version 1.0.0
 * @since 2025-01-24
 * @requires WTS_Core
 * @requires WTS_CSRFManager
 */

/**
 * WTS Store Manager - Handles all store-related operations
 * This module provides comprehensive store management capabilities including:
 * - Store mapping data persistence and management
 * - CSV parsing and validation for store mappings
 * - Store switching API calls using CSRF tokens
 * - Store selection management and validation
 * - File upload handling for CSV processing
 */
class WTS_StoreManager {
    /**
     * Initialize the Store Manager
     * @param {WTS_Core} core - Reference to WTS Core instance
     * @param {WTS_CSRFManager} csrfManager - Reference to WTS CSRF Manager instance
     */
    constructor(core, csrfManager) {
        if (!core) {
            throw new Error('WTS_StoreManager requires WTS_Core instance');
        }
        if (!csrfManager) {
            throw new Error('WTS_StoreManager requires WTS_CSRFManager instance');
        }
        
        this.core = core;
        this.csrfManager = csrfManager;
        this.version = '1.0.0';
        this.name = 'WTS_StoreManager';
        
        // Store mapping data: StoreCode -> StoreId
        this.storeMappingData = new Map();
        
        // Configuration
        this.config = {
            storageKey: 'storeMappingData',
            apiEndpoint: 'https://www.wholefoodsmarket.com/store-affinity',
            storeCodeLength: 3,
            csvRequiredColumns: ['storecode', 'storeid']
        };
        
        this.core.log(`${this.name} v${this.version} constructed`, 'debug');
    }

    // ==================== MODULE LIFECYCLE ====================

    /**
     * Initialize the Store Manager module
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            this.core.log(`Initializing ${this.name}...`, 'info');
            
            // Set up event listeners
            this._setupEventListeners();
            
            // Load existing store mappings from storage
            await this.loadStoredMappings();
            
            this.core.log(`${this.name} initialized successfully`, 'info');
            this.core.emit('store:manager-initialized', { 
                version: this.version,
                mappingCount: this.storeMappingData.size 
            });
            
            return true;
        } catch (error) {
            this.core.log(`Failed to initialize ${this.name}: ${error.message}`, 'error');
            this.core.emit('store:manager-failed', { error: error.message });
            return false;
        }
    }

    /**
     * Cleanup the Store Manager
     */
    cleanup() {
        this.core.log(`Cleaning up ${this.name}...`, 'info');
        
        // Clear store mapping data
        this.storeMappingData.clear();
        
        this.core.log(`${this.name} cleanup complete`, 'info');
        this.core.emit('store:manager-cleanup');
    }

    /**
     * Set up event listeners for CSRF token updates
     * @private
     */
    _setupEventListeners() {
        // Listen for CSRF token updates
        this.core.on('csrf:token-found', (data) => {
            this.core.log('CSRF token updated, store operations can proceed', 'debug');
        });
        
        // Listen for CSRF manager initialization
        this.core.on('csrf:manager-initialized', (data) => {
            this.core.log('CSRF Manager initialized, store operations ready', 'debug');
        });
    }

    // ==================== STORE MAPPING DATA MANAGEMENT ====================

    /**
     * Load stored mappings from persistent storage
     * @returns {Promise<boolean>} Success status
     */
    async loadStoredMappings() {
        try {
            this.core.log('Loading stored store mappings...', 'debug');
            
            const storedData = await this.core.getValue(this.config.storageKey, '{}');
            const parsedData = JSON.parse(storedData);
            
            this.storeMappingData.clear();
            Object.entries(parsedData).forEach(([storeCode, storeId]) => {
                this.storeMappingData.set(storeCode, storeId);
            });
            
            this.core.log(`Loaded ${this.storeMappingData.size} store mappings from storage`, 'info');
            this.core.emit('store:mappings-loaded', { 
                count: this.storeMappingData.size,
                mappings: Object.fromEntries(this.storeMappingData)
            });
            
            return true;
        } catch (error) {
            this.core.log(`Error loading stored mappings: ${error.message}`, 'error');
            this.storeMappingData.clear();
            return false;
        }
    }

    /**
     * Save mappings to persistent storage
     * @returns {Promise<boolean>} Success status
     */
    async saveStoredMappings() {
        try {
            const dataToStore = Object.fromEntries(this.storeMappingData);
            const success = await this.core.setValue(this.config.storageKey, JSON.stringify(dataToStore));
            
            if (success) {
                this.core.log(`Saved ${this.storeMappingData.size} store mappings to storage`, 'debug');
                this.core.emit('store:mappings-saved', { 
                    count: this.storeMappingData.size 
                });
                return true;
            } else {
                throw new Error('Failed to save to storage');
            }
        } catch (error) {
            this.core.log(`Error saving mappings: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Get all store mappings
     * @returns {Map<string, number>} Store mappings (StoreCode -> StoreId)
     */
    getStoreMappings() {
        return new Map(this.storeMappingData);
    }

    /**
     * Get store ID for a given store code
     * @param {string} storeCode - The store code to look up
     * @returns {number|null} Store ID or null if not found
     */
    getStoreId(storeCode) {
        return this.storeMappingData.get(storeCode.toUpperCase()) || null;
    }

    /**
     * Add or update a store mapping
     * @param {string} storeCode - The store code
     * @param {number} storeId - The store ID
     * @returns {Promise<boolean>} Success status
     */
    async setStoreMapping(storeCode, storeId) {
        try {
            // Validate inputs
            if (!this._validateStoreCode(storeCode)) {
                throw new Error(`Invalid store code: ${storeCode}`);
            }
            if (!this._validateStoreId(storeId)) {
                throw new Error(`Invalid store ID: ${storeId}`);
            }
            
            this.storeMappingData.set(storeCode.toUpperCase(), parseInt(storeId, 10));
            await this.saveStoredMappings();
            
            this.core.log(`Store mapping updated: ${storeCode} -> ${storeId}`, 'debug');
            this.core.emit('store:mapping-updated', { storeCode, storeId });
            
            return true;
        } catch (error) {
            this.core.log(`Error setting store mapping: ${error.message}`, 'error');
            return false;
        }
    }

    // ==================== CSV PARSING AND VALIDATION ====================

    /**
     * Parse CSV text and extract store mappings
     * @param {string} csvText - The CSV content to parse
     * @returns {Map<string, number>} Parsed store mappings
     * @throws {Error} If CSV is invalid or contains errors
     */
    parseCSV(csvText) {
        this.core.log('Parsing CSV for store mappings...', 'debug');
        
        // DIAGNOSTIC: Log CSV content details
        this.core.log(`[DIAGNOSTIC] CSV parsing - Input length: ${csvText.length}`, 'debug');
        this.core.log(`[DIAGNOSTIC] CSV parsing - First 200 chars: ${csvText.substring(0, 200)}`, 'debug');
        
        const lines = csvText.trim().split('\n');
        this.core.log(`[DIAGNOSTIC] CSV parsing - Found ${lines.length} lines`, 'debug');
        
        if (lines.length < 2) {
            const error = 'CSV file must contain at least a header row and one data row';
            this.core.log(`[DIAGNOSTIC] CSV parsing failed - insufficient lines: ${error}`, 'error');
            throw new Error(error);
        }

        // Parse header
        const header = lines[0].split(',').map(col => col.trim().replace(/"/g, ''));
        this.core.log(`[DIAGNOSTIC] CSV parsing - Header columns: ${JSON.stringify(header)}`, 'debug');
        
        const storeCodeIndex = header.findIndex(col => col.toLowerCase() === 'storecode');
        const storeIdIndex = header.findIndex(col => col.toLowerCase() === 'storeid');
        
        this.core.log(`[DIAGNOSTIC] CSV parsing - StoreCode index: ${storeCodeIndex}, StoreId index: ${storeIdIndex}`, 'debug');

        if (storeCodeIndex === -1 || storeIdIndex === -1) {
            const error = 'CSV must contain "StoreCode" and "StoreId" columns';
            this.core.log(`[DIAGNOSTIC] CSV parsing failed - missing required columns: ${error}`, 'error');
            throw new Error(error);
        }

        const mappings = new Map();
        const errors = [];

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
            this.core.log(`[DIAGNOSTIC] CSV parsing - Processing row ${i + 1}: "${lines[i]}"`, 'debug');
            
            const row = lines[i].split(',').map(col => col.trim().replace(/"/g, ''));
            this.core.log(`[DIAGNOSTIC] CSV parsing - Row ${i + 1} parsed to: ${JSON.stringify(row)}`, 'debug');
            
            if (row.length < Math.max(storeCodeIndex, storeIdIndex) + 1) {
                const error = `Row ${i + 1}: Insufficient columns`;
                this.core.log(`[DIAGNOSTIC] CSV parsing - ${error}`, 'debug');
                errors.push(error);
                continue;
            }

            const storeCode = row[storeCodeIndex];
            const storeId = row[storeIdIndex];
            
            this.core.log(`[DIAGNOSTIC] CSV parsing - Row ${i + 1} extracted: StoreCode="${storeCode}", StoreId="${storeId}"`, 'debug');

            // Validate StoreCode
            if (!this._validateStoreCode(storeCode)) {
                const error = `Row ${i + 1}: StoreCode must be exactly 3 characters (got: "${storeCode}")`;
                this.core.log(`[DIAGNOSTIC] CSV parsing - StoreCode validation failed: ${error}`, 'debug');
                errors.push(error);
                continue;
            }

            // Validate StoreId
            if (!this._validateStoreId(storeId)) {
                const error = `Row ${i + 1}: StoreId must be a valid integer (got: "${storeId}")`;
                this.core.log(`[DIAGNOSTIC] CSV parsing - StoreId validation failed: ${error}`, 'debug');
                errors.push(error);
                continue;
            }

            const parsedStoreId = parseInt(storeId, 10);
            mappings.set(storeCode.toUpperCase(), parsedStoreId);
            this.core.log(`[DIAGNOSTIC] CSV parsing - Successfully added mapping: ${storeCode.toUpperCase()} -> ${parsedStoreId}`, 'debug');
        }

        // Check for validation errors
        if (errors.length > 0) {
            const errorMessage = `Validation errors:\n${errors.join('\n')}`;
            this.core.log(`[DIAGNOSTIC] CSV parsing failed with validation errors: ${errorMessage}`, 'error');
            throw new Error(errorMessage);
        }

        if (mappings.size === 0) {
            const error = 'No valid store mappings found in the file';
            this.core.log(`[DIAGNOSTIC] CSV parsing failed - no valid mappings: ${error}`, 'error');
            throw new Error(error);
        }

        this.core.log(`[DIAGNOSTIC] CSV parsing completed successfully - ${mappings.size} mappings created`, 'debug');
        this.core.log(`Successfully parsed ${mappings.size} store mappings from CSV`, 'info');
        return mappings;
    }

    /**
     * Validate store code format
     * @private
     * @param {string} storeCode - Store code to validate
     * @returns {boolean} Is valid
     */
    _validateStoreCode(storeCode) {
        return storeCode && 
               typeof storeCode === 'string' && 
               storeCode.length === this.config.storeCodeLength;
    }

    /**
     * Validate store ID format
     * @private
     * @param {string|number} storeId - Store ID to validate
     * @returns {boolean} Is valid
     */
    _validateStoreId(storeId) {
        return storeId && 
               !isNaN(storeId) && 
               Number.isInteger(Number(storeId)) && 
               Number(storeId) > 0;
    }

    // ==================== STORE SWITCHING FUNCTIONALITY ====================

    /**
     * Switch to a specific store using its store code
     * @param {string} storeCode - The store code to switch to
     * @returns {Promise<boolean>} Success status
     */
    async switchToStore(storeCode) {
        try {
            this.core.log(`Attempting to switch to store: ${storeCode}`, 'info');
            this.core.emit('store:switch-started', { storeCode });
            
            // Validate store code exists in mappings
            const storeId = this.getStoreId(storeCode);
            if (!storeId) {
                throw new Error(`Store code ${storeCode} not found in mappings`);
            }

            // Get CSRF token from CSRF Manager
            const csrfToken = await this.csrfManager.getToken();
            if (!csrfToken) {
                throw new Error('Unable to obtain CSRF token for store switch');
            }

            this.core.log(`Using CSRF token for store switch: ${csrfToken.substring(0, 20)}...`, 'debug');

            // Perform the store switch API call
            const response = await this._performStoreSwitch(storeId, csrfToken);
            
            if (response.ok) {
                this.core.log(`Successfully switched to store ${storeCode} (ID: ${storeId})`, 'info');
                this.core.emit('store:switch-completed', { 
                    storeCode, 
                    storeId,
                    success: true 
                });
                
                // Wait a moment for the server to process the change, then refresh
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
                
                return true;
            } else {
                throw new Error(`Server responded with status: ${response.status} ${response.statusText}`);
            }

        } catch (error) {
            this.core.log(`Store switch failed: ${error.message}`, 'error');
            this.core.emit('store:switch-failed', { 
                storeCode, 
                error: error.message 
            });
            return false;
        }
    }

    /**
     * Perform the actual store switch API call
     * @private
     * @param {number} storeId - The store ID to switch to
     * @param {string} csrfToken - The CSRF token for the request
     * @returns {Promise<Response>} The fetch response
     */
    async _performStoreSwitch(storeId, csrfToken) {
        this.core.log(`Making store switch API call to ${this.config.apiEndpoint}`, 'debug');
        
        // Use the exact fetch pattern from the original implementation
        return await fetch(this.config.apiEndpoint, {
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
    }

    // ==================== FILE UPLOAD HANDLING ====================

    /**
     * Handle CSV file upload for store mappings
     * @param {File} file - The uploaded CSV file
     * @returns {Promise<boolean>} Success status
     */
    async handleFileUpload(file) {
        try {
            // DIAGNOSTIC: Log initial state
            this.core.log(`[DIAGNOSTIC] handleFileUpload called with file: ${file ? file.name : 'null'}`, 'debug');
            
            if (!file) {
                const error = 'No file provided';
                this.core.log(`[DIAGNOSTIC] File validation failed: ${error}`, 'error');
                throw new Error(error);
            }

            // DIAGNOSTIC: Log file details
            this.core.log(`[DIAGNOSTIC] File details - Name: ${file.name}, Size: ${file.size}, Type: ${file.type}`, 'debug');

            // Validate file type
            const fileName = file.name.toLowerCase();
            if (!fileName.endsWith('.csv')) {
                const error = 'Please select a CSV file (.csv extension required)';
                this.core.log(`[DIAGNOSTIC] File type validation failed: ${error}`, 'error');
                throw new Error(error);
            }

            this.core.log(`Processing uploaded file: ${file.name}`, 'info');
            this.core.emit('store:file-upload-started', { fileName: file.name });

            // DIAGNOSTIC: Log before file reading
            this.core.log(`[DIAGNOSTIC] Starting file content reading...`, 'debug');

            // Read file content
            const csvText = await this._readFileContent(file);
            
            // DIAGNOSTIC: Log file content details
            this.core.log(`[DIAGNOSTIC] File content read successfully. Length: ${csvText.length}, First 100 chars: ${csvText.substring(0, 100)}`, 'debug');
            
            // DIAGNOSTIC: Log before CSV parsing
            this.core.log(`[DIAGNOSTIC] Starting CSV parsing...`, 'debug');
            
            // Parse CSV and get new mappings
            const newMappings = this.parseCSV(csvText);
            
            // DIAGNOSTIC: Log parsing results
            this.core.log(`[DIAGNOSTIC] CSV parsing completed. Found ${newMappings.size} mappings`, 'debug');
            
            // Update the store mapping data
            this.storeMappingData.clear();
            newMappings.forEach((storeId, storeCode) => {
                this.storeMappingData.set(storeCode, storeId);
            });

            // DIAGNOSTIC: Log before saving
            this.core.log(`[DIAGNOSTIC] Starting storage save operation...`, 'debug');

            // Save to persistent storage
            const saveResult = await this.saveStoredMappings();
            
            // DIAGNOSTIC: Log save results
            this.core.log(`[DIAGNOSTIC] Storage save completed. Result: ${saveResult}`, 'debug');

            this.core.log(`Successfully loaded ${this.storeMappingData.size} store mappings from ${file.name}`, 'info');
            this.core.emit('store:file-upload-completed', {
                fileName: file.name,
                mappingCount: this.storeMappingData.size,
                success: true
            });
            
            return true;
            
        } catch (error) {
            // DIAGNOSTIC: Enhanced error logging
            this.core.log(`[DIAGNOSTIC] File upload error caught: ${error.name}: ${error.message}`, 'error');
            this.core.log(`[DIAGNOSTIC] Error stack: ${error.stack}`, 'error');
            
            this.core.log(`File upload failed: ${error.message}`, 'error');
            this.core.emit('store:file-upload-failed', {
                fileName: file?.name || 'unknown',
                error: error.message,
                errorType: error.name,
                errorStack: error.stack
            });
            return false;
        }
    }

    /**
     * Read file content as text
     * @private
     * @param {File} file - The file to read
     * @returns {Promise<string>} File content
     */
    _readFileContent(file) {
        return new Promise((resolve, reject) => {
            this.core.log(`[DIAGNOSTIC] _readFileContent - Starting to read file: ${file.name}`, 'debug');
            
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const content = e.target.result;
                this.core.log(`[DIAGNOSTIC] _readFileContent - File read successfully. Content length: ${content.length}`, 'debug');
                this.core.log(`[DIAGNOSTIC] _readFileContent - Content preview: ${content.substring(0, 50)}...`, 'debug');
                resolve(content);
            }.bind(this);
            
            reader.onerror = function(e) {
                const error = new Error(`Failed to read file: ${e.target.error?.message || 'Unknown FileReader error'}`);
                this.core.log(`[DIAGNOSTIC] _readFileContent - FileReader error: ${error.message}`, 'error');
                this.core.log(`[DIAGNOSTIC] _readFileContent - FileReader error details: ${JSON.stringify(e.target.error)}`, 'error');
                reject(error);
            }.bind(this);
            
            reader.onabort = function(e) {
                const error = new Error('File reading was aborted');
                this.core.log(`[DIAGNOSTIC] _readFileContent - FileReader aborted: ${error.message}`, 'error');
                reject(error);
            }.bind(this);
            
            this.core.log(`[DIAGNOSTIC] _readFileContent - Starting FileReader.readAsText()`, 'debug');
            reader.readAsText(file);
        });
    }

    // ==================== PUBLIC API METHODS ====================

    /**
     * Get module information
     * @returns {Object} Module information
     */
    getModuleInfo() {
        return {
            name: this.name,
            version: this.version,
            mappingCount: this.storeMappingData.size,
            hasCSRFManager: !!this.csrfManager,
            apiEndpoint: this.config.apiEndpoint
        };
    }

    /**
     * Check if a store code exists in mappings
     * @param {string} storeCode - Store code to check
     * @returns {boolean} Whether the store code exists
     */
    hasStoreCode(storeCode) {
        return this.storeMappingData.has(storeCode.toUpperCase());
    }

    /**
     * Get all store codes
     * @returns {string[]} Array of store codes
     */
    getStoreCodes() {
        return Array.from(this.storeMappingData.keys());
    }

    /**
     * Clear all store mappings
     * @returns {Promise<boolean>} Success status
     */
    async clearAllMappings() {
        try {
            this.storeMappingData.clear();
            await this.saveStoredMappings();
            
            this.core.log('All store mappings cleared', 'info');
            this.core.emit('store:mappings-cleared');
            
            return true;
        } catch (error) {
            this.core.log(`Failed to clear mappings: ${error.message}`, 'error');
            return false;
        }
    }

    // ==================== UI MANAGER COMPATIBILITY METHODS ====================

    /**
     * Upload store mappings from CSV file (UI Manager compatibility wrapper)
     * @param {File} file - The CSV file to upload
     * @returns {Promise<Object>} Result object with success status and details
     */
    async uploadStoreMappings(file) {
        try {
            this.core.log(`[DIAGNOSTIC] uploadStoreMappings called with file: ${file ? file.name : 'null'}`, 'debug');
            
            const success = await this.handleFileUpload(file);
            
            if (success) {
                return {
                    success: true,
                    count: this.storeMappingData.size,
                    message: `Successfully loaded ${this.storeMappingData.size} store mappings`
                };
            } else {
                return {
                    success: false,
                    error: 'File upload failed - check console for details',
                    count: 0
                };
            }
        } catch (error) {
            this.core.log(`[DIAGNOSTIC] uploadStoreMappings error: ${error.message}`, 'error');
            return {
                success: false,
                error: error.message,
                count: 0
            };
        }
    }

    /**
     * Switch to a store (UI Manager compatibility wrapper)
     * @param {string} storeCode - The store code to switch to
     * @returns {Promise<Object>} Result object with success status
     */
    async switchStore(storeCode) {
        try {
            this.core.log(`[DIAGNOSTIC] switchStore called with storeCode: ${storeCode}`, 'debug');
            
            const success = await this.switchToStore(storeCode);
            
            return {
                success: success,
                storeCode: storeCode,
                message: success ? `Successfully switched to store ${storeCode}` : `Failed to switch to store ${storeCode}`
            };
        } catch (error) {
            this.core.log(`[DIAGNOSTIC] switchStore error: ${error.message}`, 'error');
            return {
                success: false,
                storeCode: storeCode,
                error: error.message
            };
        }
    }

    /**
     * Get the count of store mappings (UI Manager compatibility method)
     * @returns {Promise<number>} Number of store mappings
     */
    async getMappingCount() {
        this.core.log(`[DIAGNOSTIC] getMappingCount called, returning: ${this.storeMappingData.size}`, 'debug');
        return this.storeMappingData.size;
    }

    /**
     * Get available stores (UI Manager compatibility method)
     * @returns {Promise<Array>} Array of store objects with code and id
     */
    async getAvailableStores() {
        try {
            this.core.log(`[DIAGNOSTIC] getAvailableStores called`, 'debug');
            
            const stores = [];
            for (const [storeCode, storeId] of this.storeMappingData) {
                stores.push({
                    code: storeCode,
                    id: storeId,
                    name: `Store ${storeCode}` // Basic name, could be enhanced later
                });
            }
            
            this.core.log(`[DIAGNOSTIC] getAvailableStores returning ${stores.length} stores`, 'debug');
            return stores;
        } catch (error) {
            this.core.log(`[DIAGNOSTIC] getAvailableStores error: ${error.message}`, 'error');
            return [];
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WTS_StoreManager;
}

// Make available globally for userscript usage
if (typeof window !== 'undefined') {
    window.WTS_StoreManager = WTS_StoreManager;
}