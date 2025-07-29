/**
 * WTS UI Manager Module - Phase 6 of the modular architecture
 * Handles all user interface components and orchestrates interaction with other modules
 * 
 * @author WTS Development Team
 * @version 1.0.0
 * @since 2025-01-25
 * @requires WTS_Core
 */

/**
 * WTS UI Manager - Manages all user interface components and interactions
 * This is the most complex module that orchestrates all other modules through a unified UI
 */
class WTS_UIManager {
    /**
     * Initialize the WTS UI Manager
     * @param {WTS_Core} core - Reference to WTS Core instance
     */
    constructor(core) {
        this.version = '1.0.0';
        this.name = 'WTS_UIManager';
        this.core = core;
        this.dependencies = ['WTS_DataExtractor', 'WTS_ExportManager', 'WTS_StoreManager', 'WTS_CSRFManager'];
        
        // Configuration
        this.config = {
            panelPosition: { x: 10, y: 10 },
            enableDragging: true,
            enablePositionPersistence: true,
            enableRealTimeUpdates: true,
            updateInterval: 2000,
            panelZIndex: 9999,
            modalZIndex: 10000
        };
        
        // State management
        this.state = {
            isInitialized: false,
            isPanelVisible: false,
            isDragging: false,
            isModalOpen: false,
            lastDataCount: 0,
            lastEmptyCount: 0,
            updateIntervalId: null,
            dragOffset: { x: 0, y: 0 }
        };
        
        // UI Elements
        this.elements = {
            panel: null,
            dragHeader: null,
            contentContainer: null,
            exportButton: null,
            refreshButton: null,
            uploadButton: null,
            csrfSettingsButton: null,
            storeDropdown: null,
            switchButton: null,
            statusDisplay: null,
            counterDisplay: null,
            fileInput: null,
            storeSelectContainer: null
        };
        
        // Module references (will be set during initialization)
        this.modules = {
            dataExtractor: null,
            exportManager: null,
            storeManager: null,
            csrfManager: null
        };
        
        // CSS styles for UI components
        this.styles = this._getUIStyles();
        
        this._setupEventListeners();
        this.core.log(`${this.name} v${this.version} initialized`, 'info');
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize the UI Manager module
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            this.core.log('Initializing WTS UI Manager...', 'info');
            
            // Load configuration from storage
            await this._loadConfiguration();
            
            // Get references to other modules
            await this._getModuleReferences();
            
            // Validate DOM environment
            if (!this._validateDOMEnvironment()) {
                throw new Error('DOM environment validation failed');
            }
            
            // Create the main UI panel
            await this._createMainPanel();
            
            // Set up real-time updates if enabled
            if (this.config.enableRealTimeUpdates) {
                this._startRealTimeUpdates();
            }
            
            this.state.isInitialized = true;
            this.core.emit('ui:initialized', { version: this.version });
            this.core.log('WTS UI Manager initialized successfully', 'info');
            
            return true;
        } catch (error) {
            this.core.log(`Failed to initialize UI Manager: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Shutdown the UI Manager module
     * @returns {Promise<boolean>} Success status
     */
    async shutdown() {
        try {
            this.core.log('Shutting down WTS UI Manager...', 'info');
            
            // Stop real-time updates
            this._stopRealTimeUpdates();
            
            // Remove UI elements
            this._removeUIElements();
            
            // Clear event listeners
            this._removeEventListeners();
            
            this.state.isInitialized = false;
            this.core.emit('ui:shutdown');
            this.core.log('WTS UI Manager shutdown complete', 'info');
            
            return true;
        } catch (error) {
            this.core.log(`Error during UI Manager shutdown: ${error.message}`, 'error');
            return false;
        }
    }

    // ==================== MAIN PANEL CREATION ====================

    /**
     * Create the main UI panel with all components
     * @private
     */
    async _createMainPanel() {
        try {
            // Load saved panel position
            const savedPosition = await this.core.storage.get('wts_panel_position', this.config.panelPosition);
            
            // Create main panel container
            this.elements.panel = this._createElement('div', {
                style: {
                    ...this.styles.panel,
                    top: savedPosition.y + 'px',
                    left: savedPosition.x + 'px'
                }
            });

            // Create drag header
            this._createDragHeader();
            
            // Create content container
            this._createContentContainer();
            
            // Create all UI components
            this._createButtons();
            this._createStoreControls();
            this._createStatusDisplays();
            this._createFileInput();
            
            // Assemble the panel
            this.elements.panel.appendChild(this.elements.dragHeader);
            this.elements.panel.appendChild(this.elements.contentContainer);
            
            // Add to DOM
            document.body.appendChild(this.elements.panel);
            
            // Set up drag functionality
            if (this.config.enableDragging) {
                this._setupDragFunctionality();
            }
            
            // Set up window resize handler
            this._setupResizeHandler();
            
            this.state.isPanelVisible = true;
            this.core.emit('ui:panel-created', { position: savedPosition });
            
        } catch (error) {
            this.core.log(`Error creating main panel: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Create the draggable header
     * @private
     */
    _createDragHeader() {
        this.elements.dragHeader = this._createElement('div', {
            style: this.styles.dragHeader
        });

        const dragIcon = this._createElement('span', {
            textContent: '≡',
            style: this.styles.dragIcon
        });

        const headerTitle = this._createElement('span', {
            textContent: 'WTS Tools',
            style: this.styles.headerTitle
        });

        this.elements.dragHeader.appendChild(dragIcon);
        this.elements.dragHeader.appendChild(headerTitle);
    }

    /**
     * Create the content container
     * @private
     */
    _createContentContainer() {
        this.elements.contentContainer = this._createElement('div', {
            style: this.styles.contentContainer
        });
    }

    // ==================== BUTTON CREATION ====================

    /**
     * Create all UI buttons
     * @private
     */
    _createButtons() {
        // Export button
        this.elements.exportButton = this._createElement('button', {
            textContent: '📦 Export ASIN Data',
            style: this.styles.exportButton
        });
        this.elements.exportButton.addEventListener('click', () => this._handleExportClick());

        // Refresh button
        this.elements.refreshButton = this._createElement('button', {
            textContent: '🔄 Refresh Data',
            style: this.styles.refreshButton
        });
        this.elements.refreshButton.addEventListener('click', () => this._handleRefreshClick());

        // Upload button
        this.elements.uploadButton = this._createElement('button', {
            textContent: '📁 Upload Store Mapping',
            style: this.styles.uploadButton
        });
        this.elements.uploadButton.addEventListener('click', () => this._handleUploadClick());

        // CSRF Settings button
        this.elements.csrfSettingsButton = this._createElement('button', {
            textContent: '⚙️ CSRF Settings',
            style: this.styles.csrfSettingsButton
        });
        this.elements.csrfSettingsButton.addEventListener('click', () => this._handleCSRFSettingsClick());

        // Add buttons to content container
        this.elements.contentContainer.appendChild(this.elements.exportButton);
        this.elements.contentContainer.appendChild(this.elements.refreshButton);
        this.elements.contentContainer.appendChild(this.elements.uploadButton);
        this.elements.contentContainer.appendChild(this.elements.csrfSettingsButton);
    }

    // ==================== STORE CONTROLS ====================

    /**
     * Create store selection and switching controls
     * @private
     */
    _createStoreControls() {
        // Store selection container (initially hidden)
        this.elements.storeSelectContainer = this._createElement('div', {
            style: {
                ...this.styles.storeSelectContainer,
                display: 'none'
            }
        });

        // Store selection label
        const storeSelectLabel = this._createElement('div', {
            textContent: 'Switch Store:',
            style: this.styles.storeSelectLabel
        });

        // Store dropdown
        this.elements.storeDropdown = this._createElement('select', {
            style: this.styles.storeDropdown
        });

        // Switch button
        this.elements.switchButton = this._createElement('button', {
            textContent: '🔄 Switch Store',
            style: this.styles.switchButton
        });
        this.elements.switchButton.addEventListener('click', () => this._handleStoreSwitch());

        // Assemble store controls
        this.elements.storeSelectContainer.appendChild(storeSelectLabel);
        this.elements.storeSelectContainer.appendChild(this.elements.storeDropdown);
        this.elements.storeSelectContainer.appendChild(this.elements.switchButton);
        
        this.elements.contentContainer.appendChild(this.elements.storeSelectContainer);
    }

    // ==================== STATUS DISPLAYS ====================

    /**
     * Create status and counter displays
     * @private
     */
    _createStatusDisplays() {
        // Status display for store mappings
        this.elements.statusDisplay = this._createElement('div', {
            textContent: 'No store mappings loaded',
            style: this.styles.statusDisplay
        });

        // Counter display for real-time data counts
        this.elements.counterDisplay = this._createElement('div', {
            style: this.styles.counterDisplay
        });

        this.elements.contentContainer.appendChild(this.elements.statusDisplay);
        this.elements.contentContainer.appendChild(this.elements.counterDisplay);
    }

    /**
     * Create hidden file input for CSV uploads
     * @private
     */
    _createFileInput() {
        this.elements.fileInput = this._createElement('input', {
            type: 'file',
            accept: '.csv',
            style: { display: 'none' }
        });
        this.elements.fileInput.addEventListener('change', (e) => this._handleFileSelection(e));
        this.elements.contentContainer.appendChild(this.elements.fileInput);
    }

    // ==================== EVENT HANDLERS ====================

    /**
     * Handle export button click
     * @private
     */
    async _handleExportClick() {
        try {
            this.core.emit('ui:button-clicked', { button: 'export' });
            
            if (!this.modules.dataExtractor || !this.modules.exportManager) {
                throw new Error('Required modules not available');
            }

            // Extract data using DataExtractor
            const extractionResult = await this.modules.dataExtractor.extractData();
            
            if (!extractionResult.success) {
                throw new Error('Data extraction failed');
            }

            const { data, emptyCount } = extractionResult;
            
            if (data.length === 0) {
                alert('No ASIN cards found. Try scrolling or navigating through carousels.');
                return;
            }

            // Export data using ExportManager
            const exportResult = await this.modules.exportManager.exportData(data, 'csv');
            
            if (exportResult.success) {
                alert(`✅ Export completed: ${data.length} ASIN(s) exported. ${emptyCount} empty card(s) detected.`);
                this._updateCounterDisplay(data.length, emptyCount);
            } else {
                throw new Error('Export failed');
            }

        } catch (error) {
            this.core.log(`Export error: ${error.message}`, 'error');
            alert(`❌ Export failed: ${error.message}`);
        }
    }

    /**
     * Handle refresh button click
     * @private
     */
    async _handleRefreshClick() {
        try {
            this.core.emit('ui:button-clicked', { button: 'refresh' });
            
            if (!this.modules.dataExtractor) {
                throw new Error('Data extractor module not available');
            }

            const extractionResult = await this.modules.dataExtractor.extractData();
            
            if (extractionResult.success) {
                const { data, emptyCount } = extractionResult;
                alert(`🔄 Refreshed: ${data.length} ASIN(s) found. ${emptyCount} empty card(s) detected.`);
                this._updateCounterDisplay(data.length, emptyCount);
            } else {
                throw new Error('Data refresh failed');
            }

        } catch (error) {
            this.core.log(`Refresh error: ${error.message}`, 'error');
            alert(`❌ Refresh failed: ${error.message}`);
        }
    }

    /**
     * Handle upload button click
     * @private
     */
    _handleUploadClick() {
        this.core.emit('ui:button-clicked', { button: 'upload' });
        this.elements.fileInput.click();
    }

    /**
     * Handle file selection for CSV upload
     * @private
     */
    async _handleFileSelection(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            if (!this.modules.storeManager) {
                throw new Error('Store manager module not available');
            }

            const result = await this.modules.storeManager.uploadStoreMappings(file);
            
            if (result.success) {
                alert(`✅ Store mappings uploaded successfully: ${result.count} mappings loaded`);
                this._updateStoreControls();
                this._updateStatusDisplay();
            } else {
                throw new Error(result.error || 'Upload failed');
            }

        } catch (error) {
            this.core.log(`File upload error: ${error.message}`, 'error');
            alert(`❌ Upload failed: ${error.message}`);
        }

        // Reset file input
        event.target.value = '';
    }

    /**
     * Handle CSRF settings button click
     * @private
     */
    _handleCSRFSettingsClick() {
        this.core.emit('ui:button-clicked', { button: 'csrf-settings' });
        this._showCSRFSettingsModal();
    }

    /**
     * Handle store switch button click
     * @private
     */
    async _handleStoreSwitch() {
        try {
            const selectedStoreCode = this.elements.storeDropdown.value;
            if (!selectedStoreCode) {
                alert('Please select a store to switch to');
                return;
            }

            if (!this.modules.storeManager) {
                throw new Error('Store manager module not available');
            }

            const result = await this.modules.storeManager.switchStore(selectedStoreCode);
            
            if (result.success) {
                alert(`✅ Switched to store: ${selectedStoreCode}`);
            } else {
                throw new Error(result.error || 'Store switch failed');
            }

        } catch (error) {
            this.core.log(`Store switch error: ${error.message}`, 'error');
            alert(`❌ Store switch failed: ${error.message}`);
        }
    }

    // ==================== MODAL DIALOGS ====================

    /**
     * Show CSRF settings modal dialog
     * @private
     */
    async _showCSRFSettingsModal() {
        try {
            if (this.state.isModalOpen) return;
            
            this.state.isModalOpen = true;
            this.core.emit('ui:modal-opened', { modal: 'csrf-settings' });

            // Get current CSRF settings
            const csrfSettings = await this._getCSRFSettings();
            
            // Create modal overlay
            const modal = this._createElement('div', {
                style: this.styles.modalOverlay
            });

            // Create modal content
            const modalContent = this._createElement('div', {
                style: this.styles.modalContent
            });

            // Build modal HTML
            modalContent.innerHTML = this._buildCSRFModalHTML(csrfSettings);
            
            modal.appendChild(modalContent);
            document.body.appendChild(modal);

            // Set up modal event handlers
            this._setupCSRFModalHandlers(modal, modalContent);

            // Close on background click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this._closeModal(modal);
                }
            });

        } catch (error) {
            this.core.log(`Error showing CSRF modal: ${error.message}`, 'error');
            this.state.isModalOpen = false;
        }
    }

    /**
     * Build CSRF modal HTML content
     * @private
     */
    _buildCSRFModalHTML(settings) {
        const { currentFallbackToken, useFallback, capturedToken, capturedTimestamp } = settings;
        
        let capturedTokenStatus = '';
        if (capturedToken) {
            const capturedAge = capturedTimestamp ? (Date.now() - capturedTimestamp) / (1000 * 60 * 60) : null;
            const ageText = capturedAge < 1 ? `${Math.round(capturedAge * 60)}m` : `${capturedAge.toFixed(1)}h`;
            const statusColor = capturedAge < 24 ? '#28a745' : '#ffc107';
            capturedTokenStatus = `
                <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
                    <strong>🌐 Network Captured Token:</strong><br>
                    <span style="font-family: monospace; font-size: 11px; word-break: break-all;">${capturedToken.substring(0, 40)}...</span><br>
                    <small style="color: ${statusColor};">Captured ${ageText} ago ${capturedAge < 24 ? '(Fresh)' : '(May be expired)'}</small>
                </div>
            `;
        } else {
            capturedTokenStatus = `
                <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
                    <strong>🌐 Network Captured Token:</strong><br>
                    <small style="color: #666;">No token captured yet. Browse Whole Foods pages to automatically capture tokens from network requests.</small>
                </div>
            `;
        }

        return `
            <h3 style="margin-top: 0;">CSRF Token Settings</h3>
            
            ${capturedTokenStatus}
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">
                    <input type="checkbox" id="useFallbackCheckbox" ${useFallback ? 'checked' : ''}>
                    Enable fallback CSRF token when extraction fails
                </label>
                <small style="color: #666;">When enabled, uses the fallback token if network capture and DOM extraction both fail</small>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">Fallback CSRF Token:</label>
                <textarea id="fallbackTokenInput" style="width: 100%; height: 80px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px; box-sizing: border-box;">${currentFallbackToken}</textarea>
                <small style="color: #666;">Backup token used when network capture and DOM extraction fail. Keep this updated!</small>
            </div>
            
            <div style="margin-bottom: 15px;">
                <button id="resetTokenBtn" style="padding: 8px 12px; background: #ffc107; color: #000; border: none; border-radius: 4px; cursor: pointer;">Reset to Default</button>
                <button id="testTokenBtn" style="padding: 8px 12px; background: #17a2b8; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-left: 8px;">Test Token Format</button>
                <button id="clearCapturedBtn" style="padding: 8px 12px; background: #dc3545; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-left: 8px;">Clear Captured</button>
            </div>
            
            <div style="text-align: right;">
                <button id="cancelBtn" style="padding: 8px 12px; background: #6c757d; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-right: 8px;">Cancel</button>
                <button id="saveBtn" style="padding: 8px 12px; background: #28a745; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Save</button>
            </div>
        `;
    }

    /**
     * Set up CSRF modal event handlers
     * @private
     */
    _setupCSRFModalHandlers(modal, modalContent) {
        // Reset token button
        modalContent.querySelector('#resetTokenBtn').addEventListener('click', () => {
            modalContent.querySelector('#fallbackTokenInput').value = 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==';
        });

        // Test token button
        modalContent.querySelector('#testTokenBtn').addEventListener('click', () => {
            const token = modalContent.querySelector('#fallbackTokenInput').value.trim();
            const isValid = /^[A-Za-z0-9+/]+=*$/.test(token) && token.length > 50;
            alert(isValid ? '✅ Token format appears valid' : '❌ Token format appears invalid');
        });

        // Clear captured token button
        modalContent.querySelector('#clearCapturedBtn').addEventListener('click', async () => {
            if (this.modules.csrfManager) {
                await this.modules.csrfManager.clearCapturedToken();
                alert('✅ Captured token cleared');
                this._closeModal(modal);
            }
        });

        // Cancel button
        modalContent.querySelector('#cancelBtn').addEventListener('click', () => {
            this._closeModal(modal);
        });

        // Save button
        modalContent.querySelector('#saveBtn').addEventListener('click', async () => {
            await this._saveCSRFSettings(modal, modalContent);
        });
    }

    /**
     * Save CSRF settings from modal
     * @private
     */
    async _saveCSRFSettings(modal, modalContent) {
        try {
            const newToken = modalContent.querySelector('#fallbackTokenInput').value.trim();
            const usesFallback = modalContent.querySelector('#useFallbackCheckbox').checked;
            
            if (newToken && !/^[A-Za-z0-9+/]+=*$/.test(newToken)) {
                alert('❌ Invalid token format. Token should be base64 encoded.');
                return;
            }
            
            if (this.modules.csrfManager) {
                await this.modules.csrfManager.updateSettings({
                    fallbackToken: newToken,
                    useFallback: usesFallback
                });
            }
            
            alert('✅ CSRF settings saved successfully');
            this._closeModal(modal);

        } catch (error) {
            this.core.log(`Error saving CSRF settings: ${error.message}`, 'error');
            alert(`❌ Failed to save settings: ${error.message}`);
        }
    }

    /**
     * Close modal dialog
     * @private
     */
    _closeModal(modal) {
        if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
        this.state.isModalOpen = false;
        this.core.emit('ui:modal-closed');
    }

    // ==================== DRAG FUNCTIONALITY ====================

    /**
     * Set up drag functionality for the panel
     * @private
     */
    _setupDragFunctionality() {
        this.elements.dragHeader.addEventListener('mousedown', (e) => this._handleMouseDown(e));
        document.addEventListener('mousemove', (e) => this._handleMouseMove(e));
        document.addEventListener('mouseup', () => this._handleMouseUp());
    }

    /**
     * Handle mouse down for drag start
     * @private
     */
    _handleMouseDown(e) {
        this.state.isDragging = true;
        const rect = this.elements.panel.getBoundingClientRect();
        this.state.dragOffset.x = e.clientX - rect.left;
        this.state.dragOffset.y = e.clientY - rect.top;
        
        // Visual feedback
        this.elements.panel.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
        this.elements.panel.style.transform = 'scale(1.02)';
        this.elements.dragHeader.style.background = '#dee2e6';
        document.body.style.cursor = 'move';
        
        e.preventDefault();
    }

    /**
     * Handle mouse move for dragging
     * @private
     */
    _handleMouseMove(e) {
        if (!this.state.isDragging) return;
        
        let newX = e.clientX - this.state.dragOffset.x;
        let newY = e.clientY - this.state.dragOffset.y;
        
        // Boundary constraints
        const panelRect = this.elements.panel.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Keep panel within viewport bounds
        newX = Math.max(0, Math.min(newX, viewportWidth - panelRect.width));
        newY = Math.max(0, Math.min(newY, viewportHeight - panelRect.height));
        
        this.elements.panel.style.left = newX + 'px';
        this.elements.panel.style.top = newY + 'px';
        
        e.preventDefault();
    }

    /**
     * Handle mouse up for drag end
     * @private
     */
    async _handleMouseUp() {
        if (!this.state.isDragging) return;
        
        this.state.isDragging = false;
        
        // Save position if persistence is enabled
        if (this.config.enablePositionPersistence) {
            const rect = this.elements.panel.getBoundingClientRect();
            const position = { x: rect.left, y: rect.top };
            await this.core.storage.set('wts_panel_position', position);
        }
        
        // Reset visual feedback
        this.elements.panel.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
        this.elements.panel.style.transform = 'scale(1)';
        this.elements.dragHeader.style.background = '#e9ecef';
        document.body.style.cursor = '';
    }

    // ==================== REAL-TIME UPDATES ====================

    /**
     * Start real-time updates
     * @private
     */
    _startRealTimeUpdates() {
        if (this.state.updateIntervalId) {
            clearInterval(this.state.updateIntervalId);
        }

        this.state.updateIntervalId = setInterval(() => {
            this._updateCounters();
        }, this.config.updateInterval);
    }

    /**
     * Stop real-time updates
     * @private
     */
    _stopRealTimeUpdates() {
        if (this.state.updateIntervalId) {
            clearInterval(this.state.updateIntervalId);
            this.state.updateIntervalId = null;
        }
    }

    /**
     * Update counters with current data
     * @private
     */
    async _updateCounters() {
        try {
            if (!this.modules.dataExtractor) return;

            const result = await this.modules.dataExtractor.getDataCounts();
            if (result.success) {
                const { dataCount, emptyCount } = result;
                if (dataCount !== this.state.lastDataCount || emptyCount !== this.state.lastEmptyCount) {
                    this._updateCounterDisplay(dataCount, emptyCount);
                    this.state.lastDataCount = dataCount;
                    this.state.lastEmptyCount = emptyCount;
                }
            }
        } catch (error) {
            this.core.log(`Error updating counters: ${error.message}`, 'error');
        }
    }

    /**
     * Update counter display
     * @private
     */
    _updateCounterDisplay(dataCount, emptyCount) {
        if (this.elements.counterDisplay) {
            this.elements.counterDisplay.textContent = `📊 ${dataCount} ASINs • ${emptyCount} Empty Cards`;
        }
    }

    /**
     * Update status display
     * @private
     */
    async _updateStatusDisplay() {
        try {
            if (!this.modules.storeManager) return;

            const mappingCount = await this.modules.storeManager.getMappingCount();
            
            if (mappingCount === 0) {
                this.elements.statusDisplay.textContent = 'No store mappings loaded';
                this.elements.statusDisplay.style.color = '#666';
                this.elements.storeSelectContainer.style.display = 'none';
            } else {
                this.elements.statusDisplay.textContent = `${mappingCount} store mappings loaded`;
                this.elements.statusDisplay.style.color = '#28a745';
                this.elements.storeSelectContainer.style.display = 'block';
                await this._updateStoreControls();
            }
        } catch (error) {
            this.core.log(`Error updating status display: ${error.message}`, 'error');
        }
    }

    /**
     * Update store dropdown options
     * @private
     */
    async _updateStoreControls() {
        try {
            if (!this.modules.storeManager) return;

            const stores = await this.modules.storeManager.getAvailableStores();
            
            // Clear existing options
            this.elements.storeDropdown.innerHTML = '<option value="">Select a store...</option>';
            
            // Add store options
            stores.forEach(store => {
                const option = this._createElement('option', {
                    value: store.code,
                    textContent: `${store.code} (ID: ${store.id})`
                });
                this.elements.storeDropdown.appendChild(option);
            });
        } catch (error) {
            this.core.log(`Error updating store controls: ${error.message}`, 'error');
        }
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Get references to other modules
     * @private
     */
    async _getModuleReferences() {
        this.modules.dataExtractor = this.core.getModule('WTS_DataExtractor');
        this.modules.exportManager = this.core.getModule('WTS_ExportManager');
        this.modules.storeManager = this.core.getModule('WTS_StoreManager');
        this.modules.csrfManager = this.core.getModule('WTS_CSRFManager');
    }

    /**
     * Get current CSRF settings
     * @private
     */
    async _getCSRFSettings() {
        try {
            if (this.modules.csrfManager) {
                return await this.modules.csrfManager.getSettings();
            }
            
            // Fallback to direct storage access
            return {
                currentFallbackToken: await this.core.storage.get('fallbackCSRFToken', 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw=='),
                useFallback: await this.core.storage.get('useFallbackCSRF', true),
                capturedToken: await this.core.storage.get('lastCapturedCSRFToken', null),
                capturedTimestamp: await this.core.storage.get('lastCapturedTimestamp', 0)
            };
        } catch (error) {
            this.core.log(`Error getting CSRF settings: ${error.message}`, 'error');
            return {
                currentFallbackToken: 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==',
                useFallback: true,
                capturedToken: null,
                capturedTimestamp: 0
            };
        }
    }

    /**
     * Load configuration from storage
     * @private
     */
    async _loadConfiguration() {
        try {
            const savedConfig = await this.core.storage.get('wts_ui_config', {});
            this.config = { ...this.config, ...savedConfig };
        } catch (error) {
            this.core.log(`Error loading UI configuration: ${error.message}`, 'error');
        }
    }

    /**
     * Validate DOM environment
     * @private
     */
    _validateDOMEnvironment() {
        return typeof document !== 'undefined' && document.body !== null;
    }

    /**
     * Create DOM element with properties
     * @private
     */
    _createElement(tagName, properties = {}) {
        const element = document.createElement(tagName);
        
        Object.entries(properties).forEach(([key, value]) => {
            if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else if (key === 'textContent') {
                element.textContent = value;
            } else {
                element[key] = value;
            }
        });
        
        return element;
    }

    /**
     * Set up window resize handler
     * @private
     */
    _setupResizeHandler() {
        window.addEventListener('resize', () => {
            if (!this.elements.panel) return;
            
            const rect = this.elements.panel.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let newX = rect.left;
            let newY = rect.top;
            
            // Adjust position if panel is outside viewport
            if (rect.right > viewportWidth) {
                newX = viewportWidth - rect.width;
            }
            if (rect.bottom > viewportHeight) {
                newY = viewportHeight - rect.height;
            }
            
            newX = Math.max(0, newX);
            newY = Math.max(0, newY);
            
            if (newX !== rect.left || newY !== rect.top) {
                this.elements.panel.style.left = newX + 'px';
                this.elements.panel.style.top = newY + 'px';
                
                if (this.config.enablePositionPersistence) {
                    this.core.storage.set('wts_panel_position', { x: newX, y: newY });
                }
            }
        });
    }

    /**
     * Remove UI elements from DOM
     * @private
     */
    _removeUIElements() {
        if (this.elements.panel && this.elements.panel.parentNode) {
            this.elements.panel.parentNode.removeChild(this.elements.panel);
        }
        
        // Clear element references
        Object.keys(this.elements).forEach(key => {
            this.elements[key] = null;
        });
        
        this.state.isPanelVisible = false;
    }

    /**
     * Set up event listeners for module communication
     * @private
     */
    _setupEventListeners() {
        // Listen for events from other modules
        this.core.on('data:updated', (data) => {
            this._updateCounterDisplay(data.dataCount || 0, data.emptyCount || 0);
        });

        this.core.on('export:completed', (data) => {
            this.core.log('Export completed via UI Manager', 'info');
        });

        this.core.on('store:mappings-updated', (data) => {
            this._updateStatusDisplay();
            this._updateStoreControls();
        });

        this.core.on('csrf:token-captured', (data) => {
            this.core.log('CSRF token captured', 'info');
        });

        // Listen for core events
        this.core.on('core:shutdown', () => {
            this.shutdown();
        });
    }

    /**
     * Remove event listeners
     * @private
     */
    _removeEventListeners() {
        // Remove drag event listeners
        if (this.elements.dragHeader) {
            this.elements.dragHeader.removeEventListener('mousedown', this._handleMouseDown);
        }
        document.removeEventListener('mousemove', this._handleMouseMove);
        document.removeEventListener('mouseup', this._handleMouseUp);
    }

    /**
     * Get UI styles for all components
     * @private
     */
    _getUIStyles() {
        return {
            panel: {
                position: 'fixed',
                zIndex: this.config.panelZIndex.toString(),
                background: '#f9f9f9',
                border: '1px solid #ccc',
                borderRadius: '8px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                padding: '0',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: 'sans-serif',
                transition: 'box-shadow 0.2s ease',
                userSelect: 'none'
            },
            dragHeader: {
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                background: '#e9ecef',
                borderRadius: '8px 8px 0 0',
                cursor: 'move',
                borderBottom: '1px solid #dee2e6',
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#495057'
            },
            dragIcon: {
                marginRight: '8px',
                fontSize: '16px',
                color: '#6c757d'
            },
            headerTitle: {
                fontSize: '14px',
                fontWeight: 'bold'
            },
            contentContainer: {
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            },
            exportButton: {
                padding: '10px',
                backgroundColor: '#28a745',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
            },
            refreshButton: {
                padding: '10px',
                backgroundColor: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
            },
            uploadButton: {
                padding: '10px',
                backgroundColor: '#6f42c1',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
            },
            csrfSettingsButton: {
                padding: '8px',
                backgroundColor: '#6c757d',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                marginTop: '8px'
            },
            storeSelectContainer: {
                marginTop: '8px'
            },
            storeSelectLabel: {
                fontSize: '12px',
                color: '#333',
                marginBottom: '4px'
            },
            storeDropdown: {
                width: '100%',
                padding: '6px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '12px'
            },
            switchButton: {
                width: '100%',
                padding: '8px',
                backgroundColor: '#17a2b8',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '4px',
                fontSize: '12px'
            },
            statusDisplay: {
                fontSize: '12px',
                color: '#666',
                textAlign: 'center',
                marginTop: '4px'
            },
            counterDisplay: {
                fontSize: '13px',
                color: '#333',
                marginTop: '8px',
                padding: '4px 0',
                borderTop: '1px solid #dee2e6',
                textAlign: 'center'
            },
            modalOverlay: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: this.config.modalZIndex.toString(),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            },
            modalContent: {
                backgroundColor: '#fff',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                maxWidth: '500px',
                width: '90%',
                fontFamily: 'sans-serif'
            }
        };
    }

    // ==================== PUBLIC API ====================

    /**
     * Show the UI panel
     * @returns {boolean} Success status
     */
    showPanel() {
        if (this.elements.panel) {
            this.elements.panel.style.display = 'flex';
            this.state.isPanelVisible = true;
            this.core.emit('ui:panel-shown');
            return true;
        }
        return false;
    }

    /**
     * Hide the UI panel
     * @returns {boolean} Success status
     */
    hidePanel() {
        if (this.elements.panel) {
            this.elements.panel.style.display = 'none';
            this.state.isPanelVisible = false;
            this.core.emit('ui:panel-hidden');
            return true;
        }
        return false;
    }

    /**
     * Toggle panel visibility
     * @returns {boolean} New visibility state
     */
    togglePanel() {
        return this.state.isPanelVisible ? this.hidePanel() : this.showPanel();
    }

    /**
     * Update panel position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {boolean} Success status
     */
    async updatePanelPosition(x, y) {
        if (!this.elements.panel) return false;
        
        this.elements.panel.style.left = x + 'px';
        this.elements.panel.style.top = y + 'px';
        
        if (this.config.enablePositionPersistence) {
            await this.core.storage.set('wts_panel_position', { x, y });
        }
        
        this.core.emit('ui:panel-moved', { x, y });
        return true;
    }

    /**
     * Get current panel position
     * @returns {Object} Position object with x and y coordinates
     */
    getPanelPosition() {
        if (!this.elements.panel) return null;
        
        const rect = this.elements.panel.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
    }

    /**
     * Update configuration
     * @param {Object} newConfig - Configuration updates
     * @returns {Promise<boolean>} Success status
     */
    async updateConfiguration(newConfig) {
        try {
            this.config = { ...this.config, ...newConfig };
            await this.core.storage.set('wts_ui_config', this.config);
            this.core.emit('ui:config-updated', this.config);
            return true;
        } catch (error) {
            this.core.log(`Error updating UI configuration: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Get module information
     * @returns {Object} Module information
     */
    getModuleInfo() {
        return {
            name: this.name,
            version: this.version,
            dependencies: this.dependencies,
            state: { ...this.state },
            config: { ...this.config }
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WTS_UIManager;
} else if (typeof window !== 'undefined') {
    window.WTS_UIManager = WTS_UIManager;
}