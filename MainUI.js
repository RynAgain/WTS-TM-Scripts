// ==UserScript==
// @name         WTS Main UI Module
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Main UI panel and button management for WTS
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
    let panelElement = null;
    let contentContainer = null;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let isInitialized = false;
    let buttons = new Map();
    
    // Private functions
    function createDraggablePanel() {
        WTS.shared.logger.log('MainUI', 'createDraggablePanel', 'Creating draggable panel');
        
        // Load saved panel position or use default
        const savedPosition = WTS.shared.storage.get(WTS.shared.storage.keys.PANEL_POSITION, { x: 10, y: 10 });
        
        panelElement = WTS.shared.utils.createElement('div', {}, {
            position: 'fixed',
            top: savedPosition.y + 'px',
            left: savedPosition.x + 'px',
            zIndex: '9999',
            background: '#f9f9f9',
            border: '1px solid #ccc',
            borderRadius: '8px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
            padding: '0',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'sans-serif',
            transition: 'box-shadow 0.2s ease',
            userSelect: 'none',
            minWidth: '200px'
        });

        // Create drag handle header
        const dragHeader = createDragHeader();
        
        // Create content container
        contentContainer = WTS.shared.utils.createElement('div', {}, {
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        });

        panelElement.appendChild(dragHeader);
        panelElement.appendChild(contentContainer);
        
        // Set up drag functionality
        setupDragFunctionality(dragHeader);
        
        // Handle window resize to keep panel in bounds
        setupWindowResizeHandler();
        
        // Store reference in shared state
        WTS.shared.state.ui.panelElement = panelElement;
        
        document.body.appendChild(panelElement);
        
        WTS.shared.logger.log('MainUI', 'createDraggablePanel', 'Draggable panel created successfully');
        
        return panelElement;
    }
    
    function createDragHeader() {
        const dragHeader = WTS.shared.utils.createElement('div', {}, {
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
        });

        const dragIcon = WTS.shared.utils.createElement('span', {}, {
            marginRight: '8px',
            fontSize: '16px',
            color: '#6c757d'
        });
        dragIcon.textContent = '≡';

        const headerTitle = WTS.shared.utils.createElement('span');
        headerTitle.textContent = 'WTS Tools';

        dragHeader.appendChild(dragIcon);
        dragHeader.appendChild(headerTitle);
        
        return dragHeader;
    }
    
    function setupDragFunctionality(dragHeader) {
        // Drag event handlers
        const handleMouseDown = (e) => {
            isDragging = true;
            const rect = panelElement.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            // Visual feedback
            panelElement.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
            panelElement.style.transform = 'scale(1.02)';
            dragHeader.style.background = '#dee2e6';
            document.body.style.cursor = 'move';
            
            e.preventDefault();
        };

        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            let newX = e.clientX - dragOffset.x;
            let newY = e.clientY - dragOffset.y;
            
            // Boundary constraints
            const panelRect = panelElement.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Keep panel within viewport bounds
            newX = Math.max(0, Math.min(newX, viewportWidth - panelRect.width));
            newY = Math.max(0, Math.min(newY, viewportHeight - panelRect.height));
            
            panelElement.style.left = newX + 'px';
            panelElement.style.top = newY + 'px';
            
            e.preventDefault();
        };

        const handleMouseUp = () => {
            if (!isDragging) return;
            
            isDragging = false;
            
            // Save position
            const rect = panelElement.getBoundingClientRect();
            const position = { x: rect.left, y: rect.top };
            WTS.shared.storage.set(WTS.shared.storage.keys.PANEL_POSITION, position);
            WTS.shared.state.ui.panelPosition = position;
            
            // Reset visual feedback
            panelElement.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            panelElement.style.transform = 'scale(1)';
            dragHeader.style.background = '#e9ecef';
            document.body.style.cursor = '';
            
            WTS.shared.logger.debug('MainUI', 'handleMouseUp', `Panel position saved: ${position.x}, ${position.y}`);
        };

        // Add event listeners
        dragHeader.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    function setupWindowResizeHandler() {
        window.addEventListener('resize', () => {
            if (!panelElement) return;
            
            const rect = panelElement.getBoundingClientRect();
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
                panelElement.style.left = newX + 'px';
                panelElement.style.top = newY + 'px';
                
                const position = { x: newX, y: newY };
                WTS.shared.storage.set(WTS.shared.storage.keys.PANEL_POSITION, position);
                WTS.shared.state.ui.panelPosition = position;
            }
        });
    }
    
    function createButton(config) {
        WTS.shared.logger.log('MainUI', 'createButton', `Creating button: ${config.id}`);
        
        const defaultConfig = {
            text: 'Button',
            backgroundColor: '#007bff',
            color: '#fff',
            padding: '10px',
            fontSize: '14px',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            width: '100%',
            disabled: false
        };
        
        const buttonConfig = { ...defaultConfig, ...config };
        
        const button = WTS.shared.utils.createElement('button', {
            id: buttonConfig.id,
            disabled: buttonConfig.disabled
        }, {
            padding: buttonConfig.padding,
            backgroundColor: buttonConfig.backgroundColor,
            color: buttonConfig.color,
            border: buttonConfig.border,
            borderRadius: buttonConfig.borderRadius,
            cursor: buttonConfig.disabled ? 'not-allowed' : buttonConfig.cursor,
            fontSize: buttonConfig.fontSize,
            width: buttonConfig.width,
            opacity: buttonConfig.disabled ? '0.6' : '1'
        });
        
        button.textContent = buttonConfig.text;
        
        if (buttonConfig.onClick && typeof buttonConfig.onClick === 'function') {
            button.addEventListener('click', (e) => {
                if (!button.disabled) {
                    try {
                        buttonConfig.onClick(e, button);
                    } catch (error) {
                        WTS.shared.logger.error('MainUI', 'buttonClick', `Error in button ${buttonConfig.id}: ${error.message}`);
                    }
                }
            });
        }
        
        // Store button reference
        buttons.set(buttonConfig.id, {
            element: button,
            config: buttonConfig
        });
        
        return button;
    }
    
    function updateButtonState(buttonId, state) {
        const buttonData = buttons.get(buttonId);
        if (!buttonData) {
            WTS.shared.logger.warn('MainUI', 'updateButtonState', `Button not found: ${buttonId}`);
            return false;
        }
        
        const { element } = buttonData;
        
        if (state.text !== undefined) {
            element.textContent = state.text;
        }
        
        if (state.disabled !== undefined) {
            element.disabled = state.disabled;
            element.style.cursor = state.disabled ? 'not-allowed' : 'pointer';
            element.style.opacity = state.disabled ? '0.6' : '1';
        }
        
        if (state.backgroundColor !== undefined) {
            element.style.backgroundColor = state.backgroundColor;
        }
        
        if (state.color !== undefined) {
            element.style.color = state.color;
        }
        
        WTS.shared.logger.debug('MainUI', 'updateButtonState', `Updated button ${buttonId}`);
        return true;
    }
    
    function showModal(content, options = {}) {
        WTS.shared.logger.log('MainUI', 'showModal', 'Displaying modal');
        
        const defaultOptions = {
            width: '500px',
            maxWidth: '90%',
            backgroundColor: '#fff',
            closeOnBackgroundClick: true
        };
        
        const modalOptions = { ...defaultOptions, ...options };
        
        const modal = WTS.shared.utils.createElement('div', {}, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });

        const modalContent = WTS.shared.utils.createElement('div', {}, {
            backgroundColor: modalOptions.backgroundColor,
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            maxWidth: modalOptions.maxWidth,
            width: modalOptions.width,
            fontFamily: 'sans-serif',
            maxHeight: '80vh',
            overflowY: 'auto'
        });

        if (typeof content === 'string') {
            modalContent.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            modalContent.appendChild(content);
        }

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Close on background click
        if (modalOptions.closeOnBackgroundClick) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                }
            });
        }
        
        // Return modal element for manual control
        return modal;
    }
    
    function addElement(element, position = 'bottom') {
        if (!contentContainer) {
            WTS.shared.logger.error('MainUI', 'addElement', 'Content container not available');
            return false;
        }
        
        if (position === 'top') {
            contentContainer.insertBefore(element, contentContainer.firstChild);
        } else {
            contentContainer.appendChild(element);
        }
        
        WTS.shared.logger.debug('MainUI', 'addElement', `Element added to ${position}`);
        return true;
    }
    
    function removeElement(element) {
        if (!contentContainer || !element) {
            return false;
        }
        
        if (contentContainer.contains(element)) {
            contentContainer.removeChild(element);
            WTS.shared.logger.debug('MainUI', 'removeElement', 'Element removed');
            return true;
        }
        
        return false;
    }
    
    function setupEventListeners() {
        // Listen for module events
        WTS.shared.events.on('storeSwitch', (data) => {
            if (data.status === 'starting') {
                updateButtonState('switchStoreBtn', {
                    text: '🔄 Switching...',
                    disabled: true
                });
            } else if (data.status === 'success') {
                updateButtonState('switchStoreBtn', {
                    text: '🔄 Switch Store',
                    disabled: false
                });
            } else if (data.status === 'error') {
                updateButtonState('switchStoreBtn', {
                    text: '🔄 Switch Store',
                    disabled: false
                });
            }
        });
        
        WTS.shared.events.on('dataExtracted', (data) => {
            // Update any UI elements that show data count
            const summary = `${data.data.length} ASINs, ${data.emptyCount} empty`;
            WTS.shared.events.emit('updateDataSummary', summary);
        });
        
        WTS.shared.events.on('storeMappingsUpdated', (data) => {
            // Update store-related UI elements
            WTS.shared.events.emit('updateStoreMappings', data);
        });
    }
    
    // Public API
    WTS.modules.MainUI = {
        // Create the main panel
        createPanel: function() {
            if (panelElement) {
                WTS.shared.logger.warn('MainUI', 'createPanel', 'Panel already exists');
                return panelElement;
            }
            
            return createDraggablePanel();
        },
        
        // Add a button to the panel
        addButton: function(config) {
            if (!config.id) {
                throw new Error('Button config must include an id');
            }
            
            const button = createButton(config);
            addElement(button);
            
            return button;
        },
        
        // Update button state
        updateButtonState: function(buttonId, state) {
            return updateButtonState(buttonId, state);
        },
        
        // Show a modal dialog
        showModal: function(content, options = {}) {
            return showModal(content, options);
        },
        
        // Add any element to the panel
        addElement: function(element, position = 'bottom') {
            return addElement(element, position);
        },
        
        // Remove element from panel
        removeElement: function(element) {
            return removeElement(element);
        },
        
        // Get panel element
        getPanel: function() {
            return panelElement;
        },
        
        // Get content container
        getContentContainer: function() {
            return contentContainer;
        },
        
        // Show/hide panel
        togglePanel: function(visible = null) {
            if (!panelElement) return false;
            
            const isVisible = visible !== null ? visible : panelElement.style.display === 'none';
            panelElement.style.display = isVisible ? 'flex' : 'none';
            
            WTS.shared.state.ui.panelVisible = isVisible;
            WTS.shared.storage.set(WTS.shared.storage.keys.PANEL_VISIBLE, isVisible);
            
            WTS.shared.logger.log('MainUI', 'togglePanel', `Panel ${isVisible ? 'shown' : 'hidden'}`);
            return isVisible;
        },
        
        // Get button by ID
        getButton: function(buttonId) {
            const buttonData = buttons.get(buttonId);
            return buttonData ? buttonData.element : null;
        },
        
        // Remove button
        removeButton: function(buttonId) {
            const buttonData = buttons.get(buttonId);
            if (buttonData) {
                removeElement(buttonData.element);
                buttons.delete(buttonId);
                WTS.shared.logger.log('MainUI', 'removeButton', `Button removed: ${buttonId}`);
                return true;
            }
            return false;
        },
        
        // Clear all content
        clearContent: function() {
            if (contentContainer) {
                contentContainer.innerHTML = '';
                buttons.clear();
                WTS.shared.logger.log('MainUI', 'clearContent', 'All content cleared');
            }
        },
        
        // Save current panel position
        savePosition: function() {
            if (panelElement) {
                const rect = panelElement.getBoundingClientRect();
                const position = { x: rect.left, y: rect.top };
                WTS.shared.storage.set(WTS.shared.storage.keys.PANEL_POSITION, position);
                WTS.shared.state.ui.panelPosition = position;
                return position;
            }
            return null;
        }
    };
    
    // Module initialization
    WTS.modules.MainUI.init = function() {
        if (isInitialized) {
            WTS.shared.logger.warn('MainUI', 'init', 'Module already initialized');
            return;
        }
        
        WTS.shared.logger.log('MainUI', 'init', 'Initializing Main UI module');
        
        // Set up event listeners
        setupEventListeners();
        
        // Load panel visibility state
        const panelVisible = WTS.shared.storage.get(WTS.shared.storage.keys.PANEL_VISIBLE, true);
        WTS.shared.state.ui.panelVisible = panelVisible;
        
        isInitialized = true;
        WTS.shared.logger.log('MainUI', 'init', 'Main UI module initialized successfully');
        WTS.shared.events.emit('mainUIReady');
    };
    
    // Auto-initialize when shared utilities are ready
    if (WTS.shared && WTS.shared.logger) {
        WTS.modules.MainUI.init();
    } else {
        WTS.shared.events.on('sharedReady', WTS.modules.MainUI.init);
    }
    
    WTS.shared.logger.log('MainUI', 'load', 'Main UI module loaded successfully');
})();