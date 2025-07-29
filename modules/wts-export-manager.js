/**
 * WTS Export Manager Module - Phase 4 of the modular architecture
 * Handles CSV export functionality and multiple export formats with enhanced features
 * 
 * @author WTS Development Team
 * @version 1.0.0
 * @since 2025-01-24
 * @requires WTS_Core
 */

/**
 * WTS Export Manager - Handles data export functionality with multiple format support
 * This module provides comprehensive export capabilities including CSV, JSON, and TSV formats
 */
class WTS_ExportManager {
    /**
     * Initialize the WTS Export Manager
     * @param {WTS_Core} core - Reference to WTS Core instance
     */
    constructor(core) {
        this.version = '1.0.0';
        this.name = 'WTS_ExportManager';
        this.core = core;
        this.dependencies = []; // No module dependencies, only requires core instance
        
        // Configuration
        this.config = {
            defaultFormat: 'csv',
            includeTimestamp: true,
            customFileName: null,
            encoding: 'utf-8',
            csvDelimiter: ',',
            tsvDelimiter: '\t',
            escapeQuotes: true,
            includeHeaders: true,
            dateFormat: 'YYYY-MM-DD_HH-mm-ss'
        };
        
        // State management
        this.state = {
            isExporting: false,
            lastExportTime: null,
            exportCount: 0,
            errorCount: 0,
            exportHistory: []
        };
        
        // Supported export formats
        this.formats = {
            csv: {
                extension: 'csv',
                mimeType: 'text/csv',
                delimiter: ',',
                processor: this._processCSV.bind(this)
            },
            tsv: {
                extension: 'tsv',
                mimeType: 'text/tab-separated-values',
                delimiter: '\t',
                processor: this._processTSV.bind(this)
            },
            json: {
                extension: 'json',
                mimeType: 'application/json',
                processor: this._processJSON.bind(this)
            }
        };
        
        // Standard field definitions for Whole Foods data
        this.standardFields = ['ASIN', 'Name', 'Section'];
        
        this._setupEventListeners();
        this.core.log(`${this.name} v${this.version} initialized`, 'info');
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize the Export Manager module
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            this.core.log('Initializing WTS Export Manager...', 'info');
            
            // Load configuration from storage
            await this._loadConfiguration();
            
            // Validate browser environment for file downloads
            if (!this._validateBrowserEnvironment()) {
                throw new Error('Browser environment validation failed');
            }
            
            // Register module with core
            this.core.emit('module:ready', {
                name: this.name,
                version: this.version,
                capabilities: this._getCapabilities()
            });
            
            this.core.log('WTS Export Manager initialized successfully', 'info');
            return true;
        } catch (error) {
            this.core.handleError(error, 'WTS_ExportManager.initialize');
            return false;
        }
    }

    /**
     * Setup event listeners for core integration
     * @private
     */
    _setupEventListeners() {
        // Listen for export requests from other modules
        this.core.on('export:request', (data) => {
            this._handleExportRequest(data);
        });
        
        // Listen for data from data extractor
        this.core.on('data:extracted', (data) => {
            this._handleDataReceived(data);
        });
        
        // Listen for configuration changes
        this.core.on('config:changed', (data) => {
            if (data.module === this.name) {
                this._updateConfiguration(data.config);
            }
        });
    }

    /**
     * Load configuration from storage
     * @private
     */
    async _loadConfiguration() {
        try {
            const savedConfig = await this.core.getValue('exportManager.config', {});
            this.config = { ...this.config, ...savedConfig };
            this.core.log('Export Manager configuration loaded', 'debug');
        } catch (error) {
            this.core.log('Failed to load configuration, using defaults', 'warn');
        }
    }

    /**
     * Validate browser environment for file operations
     * @private
     * @returns {boolean} Environment is valid
     */
    _validateBrowserEnvironment() {
        const required = ['Blob', 'URL', 'document'];
        for (const feature of required) {
            if (typeof window[feature] === 'undefined') {
                this.core.log(`Missing required browser feature: ${feature}`, 'error');
                return false;
            }
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
            formats: Object.keys(this.formats),
            features: [
                'multiple_formats',
                'custom_filenames',
                'timestamp_support',
                'field_selection',
                'export_history',
                'progress_tracking'
            ]
        };
    }

    // ==================== EXPORT FUNCTIONALITY ====================

    /**
     * Export data in the specified format
     * @param {Array} data - Array of objects to export
     * @param {Object} [options] - Export options
     * @returns {Promise<Object>} Export result
     */
    async exportData(data, options = {}) {
        try {
            if (this.state.isExporting) {
                throw new Error('Export already in progress');
            }

            this.state.isExporting = true;
            this.core.emit('export:started', { timestamp: Date.now(), options });

            // Validate input data
            if (!this._validateExportData(data)) {
                throw new Error('Invalid export data provided');
            }

            // Merge options with configuration
            const exportOptions = { ...this.config, ...options };
            const format = exportOptions.format || this.config.defaultFormat;

            // Validate format
            if (!this.formats[format]) {
                throw new Error(`Unsupported export format: ${format}`);
            }

            this.core.log(`Starting export of ${data.length} items in ${format} format`, 'info');

            // Process data according to format
            const formatConfig = this.formats[format];
            const processedData = await formatConfig.processor(data, exportOptions);

            // Generate filename
            const filename = this._generateFilename(format, exportOptions);

            // Create and download file
            const downloadResult = await this._downloadFile(processedData, filename, formatConfig.mimeType);

            // Update statistics
            this._updateExportStatistics(data.length, format, filename);

            // Record export in history
            this._recordExportHistory(data.length, format, filename, downloadResult);

            const result = {
                success: true,
                format,
                filename,
                itemCount: data.length,
                timestamp: Date.now(),
                size: processedData.length
            };

            this.core.emit('export:completed', result);
            this.core.log(`Export completed successfully: ${filename}`, 'info');

            return result;

        } catch (error) {
            this.state.errorCount++;
            this.core.handleError(error, 'WTS_ExportManager.exportData');
            this.core.emit('export:failed', { error: error.message, timestamp: Date.now() });
            return { success: false, error: error.message };
        } finally {
            this.state.isExporting = false;
        }
    }

    /**
     * Export data as CSV (legacy compatibility method)
     * @param {Array} data - Array of objects to export
     * @param {Object} [options] - Export options
     * @returns {Promise<Object>} Export result
     */
    async downloadCSV(data, options = {}) {
        return this.exportData(data, { ...options, format: 'csv' });
    }

    // ==================== FORMAT PROCESSORS ====================

    /**
     * Process data for CSV format
     * @private
     * @param {Array} data - Data to process
     * @param {Object} options - Processing options
     * @returns {string} Processed CSV content
     */
    _processCSV(data, options) {
        const fields = options.fields || this.standardFields;
        const delimiter = options.csvDelimiter || this.config.csvDelimiter;
        const includeHeaders = options.includeHeaders !== false;
        
        let csvContent = '';
        
        // Add headers if requested
        if (includeHeaders) {
            csvContent += fields.join(delimiter) + '\n';
        }
        
        // Process data rows
        for (const row of data) {
            const values = fields.map(field => {
                const value = row[field] || '';
                return this._escapeCSVValue(value.toString(), delimiter);
            });
            csvContent += values.join(delimiter) + '\n';
        }
        
        return csvContent;
    }

    /**
     * Process data for TSV format
     * @private
     * @param {Array} data - Data to process
     * @param {Object} options - Processing options
     * @returns {string} Processed TSV content
     */
    _processTSV(data, options) {
        const tsvOptions = { ...options, csvDelimiter: '\t' };
        return this._processCSV(data, tsvOptions);
    }

    /**
     * Process data for JSON format
     * @private
     * @param {Array} data - Data to process
     * @param {Object} options - Processing options
     * @returns {string} Processed JSON content
     */
    _processJSON(data, options) {
        const fields = options.fields || this.standardFields;
        
        // Filter data to only include specified fields
        const filteredData = data.map(row => {
            const filteredRow = {};
            fields.forEach(field => {
                filteredRow[field] = row[field] || '';
            });
            return filteredRow;
        });
        
        // Create export object with metadata
        const exportObject = {
            metadata: {
                exportDate: new Date().toISOString(),
                itemCount: data.length,
                fields: fields,
                version: this.version
            },
            data: filteredData
        };
        
        return JSON.stringify(exportObject, null, 2);
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Escape CSV value with proper quote handling
     * @private
     * @param {string} value - Value to escape
     * @param {string} delimiter - CSV delimiter
     * @returns {string} Escaped value
     */
    _escapeCSVValue(value, delimiter) {
        // Convert to string and handle null/undefined
        const stringValue = (value || '').toString();
        
        // Check if escaping is needed
        const needsEscaping = stringValue.includes('"') || 
                             stringValue.includes(delimiter) || 
                             stringValue.includes('\n') || 
                             stringValue.includes('\r');
        
        if (needsEscaping) {
            // Escape quotes by doubling them and wrap in quotes
            return '"' + stringValue.replace(/"/g, '""') + '"';
        }
        
        return stringValue;
    }

    /**
     * Generate filename for export
     * @private
     * @param {string} format - Export format
     * @param {Object} options - Export options
     * @returns {string} Generated filename
     */
    _generateFilename(format, options) {
        let filename = options.customFileName || 'wholefoods_items';
        
        // Add timestamp if requested
        if (options.includeTimestamp !== false) {
            const timestamp = this._formatTimestamp(new Date(), options.dateFormat);
            filename += `_${timestamp}`;
        }
        
        // Add format extension
        const extension = this.formats[format].extension;
        if (!filename.endsWith(`.${extension}`)) {
            filename += `.${extension}`;
        }
        
        return filename;
    }

    /**
     * Format timestamp for filename
     * @private
     * @param {Date} date - Date to format
     * @param {string} format - Format string
     * @returns {string} Formatted timestamp
     */
    _formatTimestamp(date, format) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    }

    /**
     * Download file using browser APIs
     * @private
     * @param {string} content - File content
     * @param {string} filename - Filename
     * @param {string} mimeType - MIME type
     * @returns {Promise<Object>} Download result
     */
    async _downloadFile(content, filename, mimeType) {
        try {
            // Create blob with proper encoding
            const blob = new Blob([content], { 
                type: `${mimeType};charset=${this.config.encoding}` 
            });
            
            // Create download URL
            const url = URL.createObjectURL(blob);
            
            // Create and trigger download
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = filename;
            downloadLink.style.display = 'none';
            
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            // Clean up URL
            URL.revokeObjectURL(url);
            
            return {
                success: true,
                size: blob.size,
                url: url
            };
        } catch (error) {
            throw new Error(`File download failed: ${error.message}`);
        }
    }

    /**
     * Validate export data
     * @private
     * @param {Array} data - Data to validate
     * @returns {boolean} Data is valid
     */
    _validateExportData(data) {
        if (!Array.isArray(data)) {
            this.core.log('Export data must be an array', 'error');
            return false;
        }
        
        if (data.length === 0) {
            this.core.log('Export data array is empty', 'warn');
            return true; // Allow empty exports
        }
        
        // Validate data structure
        const firstItem = data[0];
        if (typeof firstItem !== 'object' || firstItem === null) {
            this.core.log('Export data items must be objects', 'error');
            return false;
        }
        
        return true;
    }

    /**
     * Update export statistics
     * @private
     * @param {number} itemCount - Number of items exported
     * @param {string} format - Export format
     * @param {string} filename - Export filename
     */
    _updateExportStatistics(itemCount, format, filename) {
        this.state.exportCount++;
        this.state.lastExportTime = Date.now();
        
        // Save statistics to storage
        this.core.setValue('exportManager.stats', {
            exportCount: this.state.exportCount,
            errorCount: this.state.errorCount,
            lastExportTime: this.state.lastExportTime
        });
    }

    /**
     * Record export in history
     * @private
     * @param {number} itemCount - Number of items exported
     * @param {string} format - Export format
     * @param {string} filename - Export filename
     * @param {Object} downloadResult - Download result
     */
    _recordExportHistory(itemCount, format, filename, downloadResult) {
        const historyEntry = {
            timestamp: Date.now(),
            itemCount,
            format,
            filename,
            size: downloadResult.size,
            success: downloadResult.success
        };
        
        this.state.exportHistory.unshift(historyEntry);
        
        // Keep only last 50 entries
        if (this.state.exportHistory.length > 50) {
            this.state.exportHistory = this.state.exportHistory.slice(0, 50);
        }
        
        // Save to storage
        this.core.setValue('exportManager.history', this.state.exportHistory);
    }

    // ==================== EVENT HANDLERS ====================

    /**
     * Handle export request from other modules
     * @private
     * @param {Object} data - Export request data
     */
    async _handleExportRequest(data) {
        try {
            if (!data.data) {
                throw new Error('No data provided in export request');
            }
            
            const result = await this.exportData(data.data, data.options || {});
            this.core.emit('export:response', result);
        } catch (error) {
            this.core.handleError(error, 'WTS_ExportManager._handleExportRequest');
        }
    }

    /**
     * Handle data received from data extractor
     * @private
     * @param {Object} data - Extracted data
     */
    _handleDataReceived(data) {
        // Store latest data for potential export
        this._latestData = data;
        this.core.log(`Received ${data.data?.length || 0} items for potential export`, 'debug');
    }

    /**
     * Update configuration
     * @private
     * @param {Object} newConfig - New configuration
     */
    _updateConfiguration(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.core.setValue('exportManager.config', this.config);
        this.core.log('Export Manager configuration updated', 'info');
    }

    // ==================== PUBLIC API ====================

    /**
     * Get export statistics
     * @returns {Object} Export statistics
     */
    getStatistics() {
        return {
            exportCount: this.state.exportCount,
            errorCount: this.state.errorCount,
            lastExportTime: this.state.lastExportTime,
            isExporting: this.state.isExporting,
            supportedFormats: Object.keys(this.formats)
        };
    }

    /**
     * Get export history
     * @param {number} [limit] - Maximum number of entries to return
     * @returns {Array} Export history
     */
    getExportHistory(limit = 10) {
        return this.state.exportHistory.slice(0, limit);
    }

    /**
     * Update export configuration
     * @param {Object} newConfig - New configuration options
     * @returns {boolean} Success status
     */
    updateConfiguration(newConfig) {
        try {
            this._updateConfiguration(newConfig);
            return true;
        } catch (error) {
            this.core.handleError(error, 'WTS_ExportManager.updateConfiguration');
            return false;
        }
    }

    /**
     * Get supported export formats
     * @returns {Array} Array of supported format names
     */
    getSupportedFormats() {
        return Object.keys(this.formats);
    }

    /**
     * Clear export history
     * @returns {boolean} Success status
     */
    clearHistory() {
        try {
            this.state.exportHistory = [];
            this.core.setValue('exportManager.history', []);
            this.core.log('Export history cleared', 'info');
            return true;
        } catch (error) {
            this.core.handleError(error, 'WTS_ExportManager.clearHistory');
            return false;
        }
    }

    // ==================== CLEANUP ====================

    /**
     * Cleanup module resources
     */
    cleanup() {
        this.core.log('Cleaning up WTS Export Manager...', 'info');
        
        // Clear any ongoing operations
        this.state.isExporting = false;
        
        // Save final state
        this.core.setValue('exportManager.stats', {
            exportCount: this.state.exportCount,
            errorCount: this.state.errorCount,
            lastExportTime: this.state.lastExportTime
        });
        
        this.core.log('WTS Export Manager cleanup complete', 'info');
    }
}

// Module registration function for WTS Core
function registerExportManager(core) {
    if (!core) {
        throw new Error('WTS Core instance is required');
    }
    
    const exportManager = new WTS_ExportManager(core);
    
    const moduleDefinition = {
        name: 'WTS_ExportManager',
        version: exportManager.version,
        dependencies: exportManager.dependencies,
        initialize: () => exportManager.initialize(),
        cleanup: () => exportManager.cleanup(),
        instance: exportManager
    };
    
    return core.registerModule('WTS_ExportManager', moduleDefinition);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WTS_ExportManager, registerExportManager };
} else if (typeof window !== 'undefined') {
    window.WTS_ExportManager = WTS_ExportManager;
    window.registerExportManager = registerExportManager;
}