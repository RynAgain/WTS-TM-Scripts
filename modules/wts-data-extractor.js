/**
 * WTS Data Extractor Module - Phase 3 of the modular architecture
 * Handles data extraction from Whole Foods DOM elements with real-time monitoring
 * 
 * @author WTS Development Team
 * @version 1.0.0
 * @since 2025-01-23
 * @requires WTS_Core
 */

/**
 * WTS Data Extractor - Extracts product data from Whole Foods DOM elements
 * This module provides comprehensive data extraction capabilities with real-time monitoring
 */
class WTS_DataExtractor {
    /**
     * Initialize the WTS Data Extractor
     * @param {WTS_Core} core - Reference to WTS Core instance
     */
    constructor(core) {
        this.version = '1.0.0';
        this.name = 'WTS_DataExtractor';
        this.core = core;
        this.dependencies = []; // No module dependencies, only requires core instance
        
        // Configuration
        this.config = {
            monitoringInterval: 1000, // Default 1 second
            maxRetries: 3,
            retryDelay: 500,
            enableRealTimeMonitoring: false
        };
        
        // State management
        this.state = {
            isMonitoring: false,
            monitoringIntervalId: null,
            lastExtractionTime: null,
            lastDataCount: 0,
            lastEmptyCount: 0,
            extractionCount: 0,
            errorCount: 0
        };
        
        // DOM selectors
        this.selectors = {
            asinCards: '[data-csa-c-type="item"][data-csa-c-item-type="asin"]',
            emptyCards: 'li.a-carousel-card.a-carousel-card-empty',
            productName: '.a-truncate-full, .a-truncate-cut',
            sectionWidget: '[data-cel-widget]'
        };
        
        // Data validation rules
        this.validation = {
            minNameLength: 1,
            maxNameLength: 500,
            validSectionPattern: /^[a-zA-Z0-9_-]+$/
        };
        
        this._setupEventListeners();
        this.core.log(`${this.name} v${this.version} initialized`, 'info');
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize the Data Extractor module
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            this.core.log('Initializing WTS Data Extractor...', 'info');
            
            // Load configuration from storage
            await this._loadConfiguration();
            
            // Validate DOM environment
            if (!this._validateDOMEnvironment()) {
                throw new Error('DOM environment validation failed');
            }
            
            // Register module with core
            this.core.emit('module:ready', {
                name: this.name,
                version: this.version,
                capabilities: this._getCapabilities()
            });
            
            this.core.log('WTS Data Extractor initialized successfully', 'info');
            return true;
        } catch (error) {
            this.core.handleError(error, 'WTS_DataExtractor.initialize');
            return false;
        }
    }

    /**
     * Setup event listeners for core integration
     * @private
     */
    _setupEventListeners() {
        // Listen for configuration updates
        this.core.on('config:updated', (data) => {
            if (data.module === this.name) {
                this._updateConfiguration(data.config);
            }
        });
        
        // Listen for monitoring control commands
        this.core.on('data:start-monitoring', () => {
            this.startRealTimeMonitoring();
        });
        
        this.core.on('data:stop-monitoring', () => {
            this.stopRealTimeMonitoring();
        });
        
        // Listen for one-time extraction requests
        this.core.on('data:extract-once', async () => {
            const result = await this.extractData();
            this.core.emit('data:extraction-result', result);
        });
    }

    /**
     * Load configuration from storage
     * @private
     */
    async _loadConfiguration() {
        try {
            const savedConfig = await this.core.getValue('dataExtractor.config', {});
            this.config = { ...this.config, ...savedConfig };
            
            this.core.log('Configuration loaded from storage', 'debug', this.config);
        } catch (error) {
            this.core.log('Failed to load configuration, using defaults', 'warn');
        }
    }

    /**
     * Validate DOM environment
     * @private
     * @returns {boolean} Is valid
     */
    _validateDOMEnvironment() {
        if (typeof document === 'undefined') {
            this.core.log('Document object not available', 'error');
            return false;
        }
        
        if (typeof document.querySelectorAll !== 'function') {
            this.core.log('querySelectorAll not available', 'error');
            return false;
        }
        
        return true;
    }

    /**
     * Get module capabilities
     * @private
     * @returns {Object} Capabilities object
     */
    _getCapabilities() {
        return {
            dataExtraction: true,
            realTimeMonitoring: true,
            dataValidation: true,
            emptyCardDetection: true,
            configurable: true
        };
    }

    // ==================== DATA EXTRACTION ====================

    /**
     * Extract data from ASIN cards in the DOM
     * @param {Object} [options] - Extraction options
     * @returns {Promise<Object>} Extraction result with data and metadata
     */
    async extractData(options = {}) {
        const startTime = Date.now();
        
        try {
            this.core.emit('data:extraction-started', { timestamp: startTime });
            this.core.log('Starting data extraction...', 'debug');
            
            // Get DOM elements
            const cards = document.querySelectorAll(this.selectors.asinCards);
            const emptyCards = document.querySelectorAll(this.selectors.emptyCards);
            
            this.core.log(`Found ${cards.length} ASIN cards and ${emptyCards.length} empty cards`, 'debug');
            
            // Extract data from each card
            const data = [];
            const errors = [];
            
            for (let i = 0; i < cards.length; i++) {
                try {
                    const cardData = await this._extractCardData(cards[i], i);
                    if (cardData && this._validateCardData(cardData)) {
                        data.push(cardData);
                    }
                } catch (error) {
                    errors.push({
                        cardIndex: i,
                        error: error.message
                    });
                    this.core.log(`Error extracting data from card ${i}: ${error.message}`, 'warn');
                }
            }
            
            // Create result object
            const result = {
                data: data,
                metadata: {
                    totalCards: cards.length,
                    emptyCards: emptyCards.length,
                    extractedCount: data.length,
                    errorCount: errors.length,
                    errors: errors,
                    timestamp: startTime,
                    extractionTime: Date.now() - startTime,
                    extractionId: this._generateExtractionId()
                }
            };
            
            // Update state
            this.state.lastExtractionTime = startTime;
            this.state.lastDataCount = data.length;
            this.state.lastEmptyCount = emptyCards.length;
            this.state.extractionCount++;
            this.state.errorCount += errors.length;
            
            // Emit success event
            this.core.emit('data:updated', result);
            this.core.emit('data:extraction-completed', result);
            
            this.core.log(`Data extraction completed: ${data.length} items extracted in ${result.metadata.extractionTime}ms`, 'info');
            
            return result;
        } catch (error) {
            this.state.errorCount++;
            this.core.handleError(error, 'WTS_DataExtractor.extractData');
            
            const errorResult = {
                data: [],
                metadata: {
                    totalCards: 0,
                    emptyCards: 0,
                    extractedCount: 0,
                    errorCount: 1,
                    errors: [{ error: error.message }],
                    timestamp: startTime,
                    extractionTime: Date.now() - startTime,
                    extractionId: this._generateExtractionId()
                }
            };
            
            this.core.emit('data:extraction-failed', errorResult);
            return errorResult;
        }
    }

    /**
     * Extract data from a single ASIN card
     * @private
     * @param {Element} card - The card element
     * @param {number} index - Card index for debugging
     * @returns {Promise<Object>} Card data
     */
    async _extractCardData(card, index) {
        try {
            // Extract ASIN
            const asin = card.getAttribute('data-csa-c-item-id') || '';
            
            // Extract product name
            const nameElement = card.querySelector(this.selectors.productName);
            const name = nameElement?.textContent?.trim() || '[No Name]';
            
            // Extract section information
            const sectionElement = card.closest(this.selectors.sectionWidget);
            const section = sectionElement?.getAttribute('data-cel-widget') || 'Unknown';
            
            // Additional metadata
            const cardData = {
                ASIN: asin,
                Name: name,
                Section: section,
                metadata: {
                    cardIndex: index,
                    extractedAt: Date.now(),
                    hasName: nameElement !== null,
                    hasSection: sectionElement !== null
                }
            };
            
            this.core.log(`Extracted card data: ASIN=${asin}, Name="${name.substring(0, 50)}...", Section=${section}`, 'debug');
            
            return cardData;
        } catch (error) {
            throw new Error(`Failed to extract data from card ${index}: ${error.message}`);
        }
    }

    /**
     * Validate extracted card data
     * @private
     * @param {Object} cardData - Card data to validate
     * @returns {boolean} Is valid
     */
    _validateCardData(cardData) {
        if (!cardData || typeof cardData !== 'object') {
            return false;
        }
        
        // Validate ASIN
        if (!cardData.ASIN || typeof cardData.ASIN !== 'string') {
            this.core.log('Invalid ASIN in card data', 'warn');
            return false;
        }
        
        // Validate Name
        if (!cardData.Name || 
            typeof cardData.Name !== 'string' ||
            cardData.Name.length < this.validation.minNameLength ||
            cardData.Name.length > this.validation.maxNameLength) {
            this.core.log('Invalid Name in card data', 'warn');
            return false;
        }
        
        // Validate Section
        if (!cardData.Section || typeof cardData.Section !== 'string') {
            this.core.log('Invalid Section in card data', 'warn');
            return false;
        }
        
        return true;
    }

    /**
     * Generate unique extraction ID
     * @private
     * @returns {string} Unique ID
     */
    _generateExtractionId() {
        return `extract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // ==================== REAL-TIME MONITORING ====================

    /**
     * Start real-time monitoring of data changes
     * @param {Object} [options] - Monitoring options
     * @returns {Promise<boolean>} Success status
     */
    async startRealTimeMonitoring(options = {}) {
        try {
            if (this.state.isMonitoring) {
                this.core.log('Real-time monitoring is already active', 'warn');
                return true;
            }
            
            const interval = options.interval || this.config.monitoringInterval;
            
            this.core.log(`Starting real-time monitoring with ${interval}ms interval`, 'info');
            
            this.state.monitoringIntervalId = setInterval(async () => {
                try {
                    const result = await this.extractData();
                    
                    // Check for changes
                    const hasChanges = this._detectChanges(result);
                    if (hasChanges) {
                        this.core.emit('data:changes-detected', result);
                    }
                } catch (error) {
                    this.core.handleError(error, 'WTS_DataExtractor.monitoringLoop');
                }
            }, interval);
            
            this.state.isMonitoring = true;
            this.config.enableRealTimeMonitoring = true;
            
            this.core.emit('data:monitoring-started', {
                interval: interval,
                timestamp: Date.now()
            });
            
            // Save configuration
            await this._saveConfiguration();
            
            return true;
        } catch (error) {
            this.core.handleError(error, 'WTS_DataExtractor.startRealTimeMonitoring');
            return false;
        }
    }

    /**
     * Stop real-time monitoring
     * @returns {boolean} Success status
     */
    stopRealTimeMonitoring() {
        try {
            if (!this.state.isMonitoring) {
                this.core.log('Real-time monitoring is not active', 'warn');
                return true;
            }
            
            if (this.state.monitoringIntervalId) {
                clearInterval(this.state.monitoringIntervalId);
                this.state.monitoringIntervalId = null;
            }
            
            this.state.isMonitoring = false;
            this.config.enableRealTimeMonitoring = false;
            
            this.core.emit('data:monitoring-stopped', {
                timestamp: Date.now()
            });
            
            this.core.log('Real-time monitoring stopped', 'info');
            
            // Save configuration
            this._saveConfiguration();
            
            return true;
        } catch (error) {
            this.core.handleError(error, 'WTS_DataExtractor.stopRealTimeMonitoring');
            return false;
        }
    }

    /**
     * Detect changes in extracted data
     * @private
     * @param {Object} result - Current extraction result
     * @returns {boolean} Has changes
     */
    _detectChanges(result) {
        const currentDataCount = result.data.length;
        const currentEmptyCount = result.metadata.emptyCards;
        
        const hasChanges = (
            currentDataCount !== this.state.lastDataCount ||
            currentEmptyCount !== this.state.lastEmptyCount
        );
        
        if (hasChanges) {
            this.core.log(`Changes detected: Data count ${this.state.lastDataCount} → ${currentDataCount}, Empty count ${this.state.lastEmptyCount} → ${currentEmptyCount}`, 'debug');
        }
        
        return hasChanges;
    }

    // ==================== CONFIGURATION MANAGEMENT ====================

    /**
     * Update configuration
     * @param {Object} newConfig - New configuration values
     * @returns {Promise<boolean>} Success status
     */
    async updateConfiguration(newConfig) {
        try {
            const oldConfig = { ...this.config };
            this.config = { ...this.config, ...newConfig };
            
            // Restart monitoring if interval changed and monitoring is active
            if (this.state.isMonitoring && newConfig.monitoringInterval && 
                newConfig.monitoringInterval !== oldConfig.monitoringInterval) {
                this.stopRealTimeMonitoring();
                this.startRealTimeMonitoring();
            }
            
            await this._saveConfiguration();
            
            this.core.emit('data:config-updated', {
                oldConfig,
                newConfig: this.config
            });
            
            this.core.log('Configuration updated successfully', 'info');
            return true;
        } catch (error) {
            this.core.handleError(error, 'WTS_DataExtractor.updateConfiguration');
            return false;
        }
    }

    /**
     * Update configuration (internal)
     * @private
     * @param {Object} newConfig - New configuration
     */
    _updateConfiguration(newConfig) {
        this.updateConfiguration(newConfig);
    }

    /**
     * Save configuration to storage
     * @private
     */
    async _saveConfiguration() {
        try {
            await this.core.setValue('dataExtractor.config', this.config);
            this.core.log('Configuration saved to storage', 'debug');
        } catch (error) {
            this.core.log('Failed to save configuration to storage', 'warn');
        }
    }

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfiguration() {
        return { ...this.config };
    }

    // ==================== STATUS AND STATISTICS ====================

    /**
     * Get current extraction statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        return {
            extractionCount: this.state.extractionCount,
            errorCount: this.state.errorCount,
            lastExtractionTime: this.state.lastExtractionTime,
            lastDataCount: this.state.lastDataCount,
            lastEmptyCount: this.state.lastEmptyCount,
            isMonitoring: this.state.isMonitoring,
            monitoringInterval: this.config.monitoringInterval,
            successRate: this.state.extractionCount > 0 ? 
                ((this.state.extractionCount - this.state.errorCount) / this.state.extractionCount * 100).toFixed(2) + '%' : 
                'N/A'
        };
    }

    /**
     * Get current module status
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            name: this.name,
            version: this.version,
            initialized: true,
            monitoring: this.state.isMonitoring,
            lastExtraction: this.state.lastExtractionTime,
            statistics: this.getStatistics(),
            configuration: this.getConfiguration()
        };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Reset statistics
     */
    resetStatistics() {
        this.state.extractionCount = 0;
        this.state.errorCount = 0;
        this.state.lastExtractionTime = null;
        this.state.lastDataCount = 0;
        this.state.lastEmptyCount = 0;
        
        this.core.emit('data:statistics-reset', {
            timestamp: Date.now()
        });
        
        this.core.log('Statistics reset', 'info');
    }

    /**
     * Cleanup module resources
     */
    cleanup() {
        this.core.log('Cleaning up WTS Data Extractor...', 'info');
        
        // Stop monitoring
        this.stopRealTimeMonitoring();
        
        // Clear any remaining intervals
        if (this.state.monitoringIntervalId) {
            clearInterval(this.state.monitoringIntervalId);
        }
        
        // Reset state
        this.state = {
            isMonitoring: false,
            monitoringIntervalId: null,
            lastExtractionTime: null,
            lastDataCount: 0,
            lastEmptyCount: 0,
            extractionCount: 0,
            errorCount: 0
        };
        
        this.core.emit('data:cleanup-completed', {
            timestamp: Date.now()
        });
        
        this.core.log('WTS Data Extractor cleanup completed', 'info');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WTS_DataExtractor;
} else if (typeof window !== 'undefined') {
    window.WTS_DataExtractor = WTS_DataExtractor;
    
    // Don't auto-register - let the main script handle initialization
    // This prevents race conditions and ensures proper initialization order
}