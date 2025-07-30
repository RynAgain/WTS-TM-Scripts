// ==UserScript==
// @name         WTS UI Components
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  UI components and management for WTS scripts
// @author       WTS-TM-Scripts
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    // UI Components Module
    let panel = null;
    let lastExtractedData = [];

    window.WTSUIComponents = {
        get panel() { return panel; },
        get lastExtractedData() { return lastExtractedData; },
        set lastExtractedData(value) { lastExtractedData = value; },

        // Create the main control panel
        createControlPanel() {
            // Load saved panel position or use default
            const savedPosition = GM_getValue('wts_panel_position', { x: 10, y: 10 });
            
            panel = document.createElement('div');
            panel.style.position = 'fixed';
            panel.style.top = savedPosition.y + 'px';
            panel.style.left = savedPosition.x + 'px';
            panel.style.zIndex = '9999';
            panel.style.background = '#f9f9f9';
            panel.style.border = '1px solid #ccc';
            panel.style.borderRadius = '8px';
            panel.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            panel.style.padding = '0';
            panel.style.display = 'flex';
            panel.style.flexDirection = 'column';
            panel.style.fontFamily = 'sans-serif';
            panel.style.transition = 'box-shadow 0.2s ease';
            panel.style.userSelect = 'none';

            // Create drag handle header
            const dragHeader = this.createDragHeader();
            
            // Create content container
            const contentContainer = this.createContentContainer();

            // Add drag functionality
            this.addDragFunctionality(dragHeader);

            panel.appendChild(dragHeader);
            panel.appendChild(contentContainer);

            // Add buttons and components
            this.addControlButtons(contentContainer);
            this.addStoreManagement(contentContainer);
            this.addCSRFSettings(contentContainer);

            document.body.appendChild(panel);
        },

        // Create drag handle header
        createDragHeader() {
            const dragHeader = document.createElement('div');
            dragHeader.style.display = 'flex';
            dragHeader.style.alignItems = 'center';
            dragHeader.style.padding = '8px 12px';
            dragHeader.style.background = '#e9ecef';
            dragHeader.style.borderRadius = '8px 8px 0 0';
            dragHeader.style.cursor = 'move';
            dragHeader.style.borderBottom = '1px solid #dee2e6';
            dragHeader.style.fontSize = '14px';
            dragHeader.style.fontWeight = 'bold';
            dragHeader.style.color = '#495057';

            const dragIcon = document.createElement('span');
            dragIcon.textContent = '≡';
            dragIcon.style.marginRight = '8px';
            dragIcon.style.fontSize = '16px';
            dragIcon.style.color = '#6c757d';

            const headerTitle = document.createElement('span');
            headerTitle.textContent = 'WTS Tools';

            dragHeader.appendChild(dragIcon);
            dragHeader.appendChild(headerTitle);

            return dragHeader;
        },

        // Create content container
        createContentContainer() {
            const contentContainer = document.createElement('div');
            contentContainer.style.padding = '12px';
            contentContainer.style.display = 'flex';
            contentContainer.style.flexDirection = 'column';
            contentContainer.style.gap = '8px';

            return contentContainer;
        },

        // Add drag functionality to the panel
        addDragFunctionality(dragHeader) {
            let isDragging = false;
            let dragOffset = { x: 0, y: 0 };

            const handleMouseDown = (e) => {
                isDragging = true;
                const rect = panel.getBoundingClientRect();
                dragOffset.x = e.clientX - rect.left;
                dragOffset.y = e.clientY - rect.top;
                
                // Visual feedback
                panel.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
                panel.style.transform = 'scale(1.02)';
                dragHeader.style.background = '#dee2e6';
                document.body.style.cursor = 'move';
                
                e.preventDefault();
            };

            const handleMouseMove = (e) => {
                if (!isDragging) return;
                
                let newX = e.clientX - dragOffset.x;
                let newY = e.clientY - dragOffset.y;
                
                // Boundary constraints
                const panelRect = panel.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                // Keep panel within viewport bounds
                newX = Math.max(0, Math.min(newX, viewportWidth - panelRect.width));
                newY = Math.max(0, Math.min(newY, viewportHeight - panelRect.height));
                
                panel.style.left = newX + 'px';
                panel.style.top = newY + 'px';
                
                e.preventDefault();
            };

            const handleMouseUp = () => {
                if (!isDragging) return;
                
                isDragging = false;
                
                // Save position
                const rect = panel.getBoundingClientRect();
                const position = { x: rect.left, y: rect.top };
                GM_setValue('wts_panel_position', position);
                
                // Reset visual feedback
                panel.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                panel.style.transform = 'scale(1)';
                dragHeader.style.background = '#e9ecef';
                document.body.style.cursor = '';
            };

            // Add event listeners
            dragHeader.addEventListener('mousedown', handleMouseDown);
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            // Handle window resize to keep panel in bounds
            window.addEventListener('resize', () => {
                const rect = panel.getBoundingClientRect();
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
                    panel.style.left = newX + 'px';
                    panel.style.top = newY + 'px';
                    GM_setValue('wts_panel_position', { x: newX, y: newY });
                }
            });
        },

        // Add control buttons (Export, Refresh)
        addControlButtons(container) {
            // Export button
            const exportBtn = document.createElement('button');
            exportBtn.textContent = '📦 Export ASIN Data';
            exportBtn.style.padding = '10px';
            exportBtn.style.backgroundColor = '#28a745';
            exportBtn.style.color = '#fff';
            exportBtn.style.border = 'none';
            exportBtn.style.borderRadius = '5px';
            exportBtn.style.cursor = 'pointer';

            exportBtn.addEventListener('click', () => {
                if (lastExtractedData.length === 0) {
                    const { data, emptyCount } = window.WTSDataExtractor.extractDataFromCards();
                    lastExtractedData = data;
                    alert(`${data.length} ASIN(s) found. ${emptyCount} empty card(s) detected.`);

                    if (data.length === 0) {
                        alert('No ASIN cards found. Try scrolling or navigating through carousels.');
                        return;
                    }
                }
                window.WTSDataExtractor.downloadCSV(lastExtractedData);
            });

            // Refresh button
            const refreshBtn = document.createElement('button');
            refreshBtn.textContent = '🔄 Refresh Data';
            refreshBtn.style.padding = '10px';
            refreshBtn.style.backgroundColor = '#007bff';
            refreshBtn.style.color = '#fff';
            refreshBtn.style.border = 'none';
            refreshBtn.style.borderRadius = '5px';
            refreshBtn.style.cursor = 'pointer';

            refreshBtn.addEventListener('click', () => {
                lastExtractedData = [];
                const { data, emptyCount } = window.WTSDataExtractor.extractDataFromCards();
                lastExtractedData = data;
                alert(`🔄 Refreshed: ${data.length} ASIN(s) found. ${emptyCount} empty card(s) detected.`);
            });

            container.appendChild(exportBtn);
            container.appendChild(refreshBtn);
        },

        // Add store management components
        addStoreManagement(container) {
            // Upload button
            const uploadBtn = document.createElement('button');
            uploadBtn.textContent = '📁 Upload Store Mapping';
            uploadBtn.style.padding = '10px';
            uploadBtn.style.backgroundColor = '#6f42c1';
            uploadBtn.style.color = '#fff';
            uploadBtn.style.border = 'none';
            uploadBtn.style.borderRadius = '5px';
            uploadBtn.style.cursor = 'pointer';

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.csv';
            fileInput.style.display = 'none';

            uploadBtn.addEventListener('click', () => {
                fileInput.click();
            });

            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const result = await window.WTSStoreManager.handleFileUpload(file);
                        alert(`✅ Successfully loaded ${result.count} store mappings from ${result.fileName}`);
                        window.WTSUIComponents.updateStoreUI();
                    } catch (error) {
                        alert(`❌ ${error.message}`);
                    }
                }
                // Reset the input so the same file can be selected again
                fileInput.value = '';
            });

            // Status display
            const statusDiv = document.createElement('div');
            statusDiv.id = 'store-status';
            statusDiv.style.fontSize = '12px';
            statusDiv.style.color = '#666';
            statusDiv.style.textAlign = 'center';
            statusDiv.style.marginTop = '4px';

            // Store switching container
            const storeSelectContainer = document.createElement('div');
            storeSelectContainer.id = 'store-select-container';
            storeSelectContainer.style.display = 'none';
            storeSelectContainer.style.marginTop = '8px';

            const storeSelectLabel = document.createElement('div');
            storeSelectLabel.textContent = 'Switch Store:';
            storeSelectLabel.style.fontSize = '12px';
            storeSelectLabel.style.color = '#333';
            storeSelectLabel.style.marginBottom = '4px';

            const storeSelect = document.createElement('select');
            storeSelect.id = 'store-select';
            storeSelect.style.width = '100%';
            storeSelect.style.padding = '6px';
            storeSelect.style.borderRadius = '4px';
            storeSelect.style.border = '1px solid #ccc';
            storeSelect.style.fontSize = '12px';

            const switchBtn = document.createElement('button');
            switchBtn.textContent = '🔄 Switch Store';
            switchBtn.style.width = '100%';
            switchBtn.style.padding = '8px';
            switchBtn.style.backgroundColor = '#17a2b8';
            switchBtn.style.color = '#fff';
            switchBtn.style.border = 'none';
            switchBtn.style.borderRadius = '4px';
            switchBtn.style.cursor = 'pointer';
            switchBtn.style.marginTop = '4px';
            switchBtn.style.fontSize = '12px';

            switchBtn.addEventListener('click', async () => {
                const selectedStoreCode = storeSelect.value;
                if (!selectedStoreCode) {
                    alert('Please select a store to switch to');
                    return;
                }

                const originalButtonText = switchBtn.textContent;
                switchBtn.textContent = '🔄 Switching...';
                switchBtn.disabled = true;

                try {
                    const result = await window.WTSStoreManager.switchToStore(selectedStoreCode);
                    alert(`✅ ${result.message}`);
                    
                    // Wait a moment for the server to process the change, then refresh
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } catch (error) {
                    alert(`❌ ${error.message}`);
                } finally {
                    switchBtn.textContent = originalButtonText;
                    switchBtn.disabled = false;
                }
            });

            storeSelectContainer.appendChild(storeSelectLabel);
            storeSelectContainer.appendChild(storeSelect);
            storeSelectContainer.appendChild(switchBtn);

            container.appendChild(uploadBtn);
            container.appendChild(statusDiv);
            container.appendChild(storeSelectContainer);
            container.appendChild(fileInput);

            // Initialize store UI
            window.WTSUIComponents.updateStoreUI();
        },

        // Update store UI based on current mappings
        updateStoreUI() {
            const statusDiv = document.getElementById('store-status');
            const storeSelectContainer = document.getElementById('store-select-container');
            const storeSelect = document.getElementById('store-select');

            const mappingCount = window.WTSStoreManager.getMappingCount();

            if (mappingCount === 0) {
                statusDiv.textContent = 'No store mappings loaded';
                statusDiv.style.color = '#666';
                storeSelectContainer.style.display = 'none';
            } else {
                statusDiv.textContent = `${mappingCount} store mappings loaded`;
                statusDiv.style.color = '#28a745';
                storeSelectContainer.style.display = 'block';

                // Update dropdown options
                storeSelect.innerHTML = '<option value="">Select a store...</option>';
                const sortedStores = window.WTSStoreManager.getSortedStoreList();
                
                sortedStores.forEach(([storeCode, storeId]) => {
                    const option = document.createElement('option');
                    option.value = storeCode;
                    option.textContent = `${storeCode} (ID: ${storeId})`;
                    storeSelect.appendChild(option);
                });
            }
        },

        // Add CSRF settings button
        addCSRFSettings(container) {
            const csrfSettingsBtn = document.createElement('button');
            csrfSettingsBtn.textContent = '⚙️ CSRF Settings';
            csrfSettingsBtn.style.padding = '8px';
            csrfSettingsBtn.style.backgroundColor = '#6c757d';
            csrfSettingsBtn.style.color = '#fff';
            csrfSettingsBtn.style.border = 'none';
            csrfSettingsBtn.style.borderRadius = '4px';
            csrfSettingsBtn.style.cursor = 'pointer';
            csrfSettingsBtn.style.fontSize = '12px';
            csrfSettingsBtn.style.marginTop = '8px';

            csrfSettingsBtn.addEventListener('click', () => {
                window.WTSUIComponents.showCSRFSettings();
            });

            container.appendChild(csrfSettingsBtn);
        },

        // Show CSRF settings modal
        showCSRFSettings() {
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            modal.style.zIndex = '10000';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';

            const modalContent = document.createElement('div');
            modalContent.style.backgroundColor = '#fff';
            modalContent.style.padding = '20px';
            modalContent.style.borderRadius = '8px';
            modalContent.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            modalContent.style.maxWidth = '500px';
            modalContent.style.width = '90%';
            modalContent.style.fontFamily = 'sans-serif';

            const currentFallbackToken = GM_getValue('fallbackCSRFToken', 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==');
            const useFallback = GM_getValue('useFallbackCSRF', true);
            
            // Get captured token info
            const capturedToken = GM_getValue('lastCapturedCSRFToken', null);
            const capturedTimestamp = GM_getValue('lastCapturedTimestamp', 0);
            const capturedAge = capturedTimestamp ? (Date.now() - capturedTimestamp) / (1000 * 60 * 60) : null;
            
            let capturedTokenStatus = '';
            if (capturedToken) {
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

            modalContent.innerHTML = `
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

            modal.appendChild(modalContent);
            document.body.appendChild(modal);

            // Event handlers
            document.getElementById('resetTokenBtn').addEventListener('click', () => {
                document.getElementById('fallbackTokenInput').value = 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==';
            });

            document.getElementById('testTokenBtn').addEventListener('click', () => {
                const token = document.getElementById('fallbackTokenInput').value.trim();
                const isValid = /^[A-Za-z0-9+/]+=*$/.test(token) && token.length > 50;
                alert(isValid ? '✅ Token format appears valid' : '❌ Token format appears invalid');
            });

            document.getElementById('clearCapturedBtn').addEventListener('click', () => {
                GM_deleteValue('lastCapturedCSRFToken');
                GM_deleteValue('lastCapturedTimestamp');
                window.WTSCSRFManager.capturedCSRFToken = null;
                alert('✅ Captured token cleared');
                document.body.removeChild(modal);
            });

            document.getElementById('cancelBtn').addEventListener('click', () => {
                document.body.removeChild(modal);
            });

            document.getElementById('saveBtn').addEventListener('click', () => {
                const newToken = document.getElementById('fallbackTokenInput').value.trim();
                const usesFallback = document.getElementById('useFallbackCheckbox').checked;
                
                if (newToken && !/^[A-Za-z0-9+/]+=*$/.test(newToken)) {
                    alert('❌ Invalid token format. Token should be base64 encoded.');
                    return;
                }
                
                GM_setValue('fallbackCSRFToken', newToken);
                GM_setValue('useFallbackCSRF', usesFallback);
                
                alert('✅ CSRF settings saved successfully');
                document.body.removeChild(modal);
            });

            // Close on background click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                }
            });
        },

        // Add dynamic card counter
        addCardCounter() {
            const counter = document.createElement('div');
            counter.id = 'asin-card-counter';
            counter.style.fontSize = '13px';
            counter.style.color = '#333';
            counter.style.marginTop = '8px';
            counter.style.padding = '4px 0';
            counter.style.borderTop = '1px solid #dee2e6';
            counter.style.textAlign = 'center';
            
            // Find the panel and append to its content container
            const contentContainer = panel?.querySelector('div:last-child');
            contentContainer?.appendChild(counter);

            // Update counter every second
            setInterval(() => {
                const { data, emptyCount } = window.WTSDataExtractor.extractDataFromCards();
                counter.textContent = `Visible ASINs: ${data.length} | Empty cards: ${emptyCount}`;
            }, 1000);
        },

        // Initialize the UI
        init() {
            window.WTSUIComponents.createControlPanel();
            window.WTSUIComponents.addCardCounter();
        }
    };

})();