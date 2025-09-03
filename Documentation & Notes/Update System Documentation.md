# Update System Documentation (Just WTSmain.js)

## Overview

This document provides comprehensive documentation for the update system implemented in WtsMain.user.js. The system provides automatic version checking, user notifications, and manual update capabilities for userscripts. This architecture can be adapted for other projects requiring similar update functionality.

## Table of Contents

1. [Overall Architecture](#overall-architecture)
2. [Key Components](#key-components)
3. [Configuration Variables and Constants](#configuration-variables-and-constants)
4. [Update Checking Process Flow](#update-checking-process-flow)
5. [User Notification System](#user-notification-system)
6. [Adapting for Other Projects](#adapting-for-other-projects)
7. [Best Practices and Considerations](#best-practices-and-considerations)
8. [Code Examples](#code-examples)

## Overall Architecture

The update system follows a modular, event-driven architecture with the following key principles:

- **Automatic Background Checking**: Periodic version checks without user intervention
- **Manual On-Demand Checking**: User-initiated update checks with immediate feedback
- **Graceful Degradation**: Fallback mechanisms when network requests fail
- **User Control**: Options to skip versions, remind later, or update immediately
- **Persistent Storage**: Remembers user preferences and check timestamps

### System Flow Diagram

```
[Script Startup] → [Initialize Version Checking] → [Background Timer]
                                ↓
[Check GitHub for Latest] → [Compare Versions] → [Show Notification if Newer]
                                ↓
[User Choice: Update/Skip/Remind] → [Handle User Action]
```

## Key Components

### 1. Version Management
- **Current Version Tracking**: Maintains the current script version
- **Version Comparison Logic**: Semantic version comparison algorithm
- **Version Storage**: Persistent storage of version check results

### 2. Network Layer
- **GitHub Integration**: Fetches latest version from GitHub repository
- **CORS Handling**: Uses GM_xmlhttpRequest to bypass browser restrictions
- **Error Handling**: Comprehensive error handling for network failures

### 3. User Interface
- **Modal Notifications**: Professional update notification modals
- **Manual Check Button**: User-initiated version checking
- **Progress Feedback**: Loading states and status messages

### 4. Persistence Layer
- **Tampermonkey Storage**: Uses GM_setValue/GM_getValue for data persistence
- **Timestamp Tracking**: Records when checks were performed
- **User Preferences**: Stores skipped versions and user choices

## Configuration Variables and Constants

### Core Configuration

```javascript
// Version checking variables
const CURRENT_VERSION = '1.3.031';
const GITHUB_VERSION_URL = 'https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.user.js';
const VERSION_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
```

### Key Configuration Parameters

| Variable | Purpose | Default Value | Customizable |
|----------|---------|---------------|--------------|
| `CURRENT_VERSION` | Current script version | '1.3.031' | ✅ Required |
| `GITHUB_VERSION_URL` | URL to fetch latest version | GitHub raw URL | ✅ Required |
| `VERSION_CHECK_INTERVAL` | Check frequency | 24 hours | ✅ Optional |

### Storage Keys

| Key | Purpose | Data Type |
|-----|---------|-----------|
| `lastVersionCheck` | Timestamp of last check | Number |
| `skippedVersion` | User-skipped version | String |
| `lastCapturedCSRFToken` | Authentication token | String |
| `lastCapturedTimestamp` | Token capture time | Number |

## Update Checking Process Flow

### 1. Initialization Phase

```javascript
function startVersionChecking() {
    console.log('🔍 Starting automatic version checking...');
    
    // Check immediately on startup (but don't show "no update" message)
    setTimeout(() => {
        checkForUpdates(false);
    }, 5000); // Wait 5 seconds after startup
    
    // Set up periodic checking
    versionCheckInterval = setInterval(() => {
        checkForUpdates(false);
    }, VERSION_CHECK_INTERVAL);
    
    console.log('✅ Version checking initialized');
}
```

### 2. Version Check Process

The [`checkForUpdates()`](WtsMain.user.js:369) function implements the core checking logic:

1. **Rate Limiting**: Prevents excessive API calls
2. **Network Request**: Fetches latest version from GitHub
3. **Version Extraction**: Parses version from script content
4. **Comparison**: Determines if update is available
5. **User Notification**: Shows appropriate UI based on results

### 3. Version Comparison Algorithm

The [`isNewerVersion()`](WtsMain.user.js:460) function implements semantic version comparison:

```javascript
function isNewerVersion(latest, current) {
    // Simple version comparison - assumes format like "1.3.012"
    const latestParts = latest.split('.').map(part => parseInt(part, 10));
    const currentParts = current.split('.').map(part => parseInt(part, 10));
    
    // Pad arrays to same length
    const maxLength = Math.max(latestParts.length, currentParts.length);
    while (latestParts.length < maxLength) latestParts.push(0);
    while (currentParts.length < maxLength) currentParts.push(0);
    
    // Compare each part
    for (let i = 0; i < maxLength; i++) {
        if (latestParts[i] > currentParts[i]) {
            return true;
        } else if (latestParts[i] < currentParts[i]) {
            return false;
        }
    }
    
    return false; // Versions are equal
}
```

## User Notification System

### 1. Modal Design

The [`showUpdateNotification()`](WtsMain.user.js:482) function creates a professional modal with:

- **Visual Hierarchy**: Clear title, version comparison, and action buttons
- **Brand Consistency**: Matches application design language
- **Accessibility**: Keyboard navigation and screen reader support
- **Responsive Design**: Adapts to different screen sizes

### 2. User Actions

The notification modal provides three primary actions:

| Action | Behavior | Storage Impact |
|--------|----------|----------------|
| **Update Now** | Opens GitHub URL in new tab | None |
| **Remind Later** | Dismisses modal, resets check timer | Clears `lastVersionCheck` |
| **Skip This Version** | Dismisses modal, ignores this version | Sets `skippedVersion` |

### 3. Modal Implementation

```javascript
function showUpdateNotification(latestVersion) {
    const updateModal = document.createElement('div');
    // ... modal styling and content ...
    
    // Event handlers for user actions
    updateBtn.addEventListener('click', () => {
        window.open('https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.user.js', '_blank');
        document.body.removeChild(updateModal);
    });
    
    remindBtn.addEventListener('click', () => {
        GM_setValue('lastVersionCheck', 0);
        document.body.removeChild(updateModal);
    });
    
    skipBtn.addEventListener('click', () => {
        GM_setValue('skippedVersion', latestVersion);
        document.body.removeChild(updateModal);
    });
}
```

## Adapting for Other Projects

### 1. Basic Implementation Steps

1. **Copy Core Functions**: Extract the version checking functions
2. **Update Configuration**: Modify constants for your project
3. **Customize UI**: Adapt modal design to match your application
4. **Integrate Storage**: Implement appropriate persistence mechanism

### 2. Required Modifications

#### Configuration Updates
```javascript
// Update these constants for your project
const CURRENT_VERSION = 'YOUR_VERSION';
const GITHUB_VERSION_URL = 'YOUR_GITHUB_RAW_URL';
const VERSION_CHECK_INTERVAL = YOUR_INTERVAL; // in milliseconds
```

#### Storage Adaptation
```javascript
// For non-Tampermonkey environments, replace GM_* functions
function setValue(key, value) {
    // localStorage, IndexedDB, or your preferred storage
    localStorage.setItem(key, JSON.stringify(value));
}

function getValue(key, defaultValue) {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
}
```

#### Network Request Adaptation
```javascript
// For environments without GM_xmlhttpRequest
async function fetchLatestVersion() {
    try {
        const response = await fetch(GITHUB_VERSION_URL, {
            cache: 'no-cache',
            headers: {
                'User-Agent': 'Your-App-Update-Checker'
            }
        });
        return await response.text();
    } catch (error) {
        throw new Error(`Network error: ${error.message}`);
    }
}
```

### 3. Framework-Specific Adaptations

#### React/Vue.js Integration
```javascript
// React Hook example
function useUpdateChecker() {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [latestVersion, setLatestVersion] = useState(null);
    
    useEffect(() => {
        const checkForUpdates = async () => {
            // Implementation here
        };
        
        checkForUpdates();
        const interval = setInterval(checkForUpdates, VERSION_CHECK_INTERVAL);
        return () => clearInterval(interval);
    }, []);
    
    return { updateAvailable, latestVersion };
}
```

#### Electron Application
```javascript
// Main process update checking
const { ipcMain } = require('electron');

ipcMain.handle('check-for-updates', async () => {
    // Implement update checking logic
    return await checkForUpdates();
});

// Renderer process
const { ipcRenderer } = require('electron');

async function checkUpdates() {
    const result = await ipcRenderer.invoke('check-for-updates');
    return result;
}
```

## Best Practices and Considerations

### 1. Performance Optimization

- **Rate Limiting**: Implement proper intervals to avoid API abuse
- **Caching**: Cache results to reduce network requests
- **Background Processing**: Perform checks without blocking UI
- **Graceful Degradation**: Handle network failures elegantly

### 2. User Experience

- **Non-Intrusive**: Don't interrupt critical user workflows
- **Clear Communication**: Provide clear update information
- **User Control**: Allow users to control update behavior
- **Progress Feedback**: Show loading states during checks

### 3. Security Considerations

- **HTTPS Only**: Always use secure connections for update checks
- **Content Validation**: Validate downloaded content before processing
- **User Consent**: Require explicit user action for updates
- **Error Handling**: Don't expose sensitive information in error messages

### 4. Reliability Patterns

#### Retry Logic
```javascript
async function checkForUpdatesWithRetry(maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await checkForUpdates();
        } catch (error) {
            if (attempt === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}
```

#### Circuit Breaker Pattern
```javascript
class UpdateChecker {
    constructor() {
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.circuitOpen = false;
    }
    
    async checkForUpdates() {
        if (this.circuitOpen && Date.now() - this.lastFailureTime < 300000) {
            throw new Error('Circuit breaker is open');
        }
        
        try {
            const result = await this.performCheck();
            this.failureCount = 0;
            this.circuitOpen = false;
            return result;
        } catch (error) {
            this.failureCount++;
            this.lastFailureTime = Date.now();
            
            if (this.failureCount >= 3) {
                this.circuitOpen = true;
            }
            
            throw error;
        }
    }
}
```

### 5. Testing Strategies

- **Mock Network Requests**: Test with simulated responses
- **Version Comparison Testing**: Test edge cases in version logic
- **UI Testing**: Verify modal behavior and user interactions
- **Storage Testing**: Test persistence across sessions

## Code Examples

### Complete Minimal Implementation

```javascript
class SimpleUpdateChecker {
    constructor(config) {
        this.currentVersion = config.currentVersion;
        this.updateUrl = config.updateUrl;
        this.checkInterval = config.checkInterval || 24 * 60 * 60 * 1000;
        this.storage = config.storage || localStorage;
    }
    
    async init() {
        // Check on startup
        setTimeout(() => this.checkForUpdates(false), 5000);
        
        // Set up periodic checking
        setInterval(() => this.checkForUpdates(false), this.checkInterval);
    }
    
    async checkForUpdates(showNoUpdateMessage = false) {
        try {
            const lastCheck = this.getStoredValue('lastVersionCheck', 0);
            const now = Date.now();
            
            if (!showNoUpdateMessage && (now - lastCheck) < this.checkInterval) {
                return;
            }
            
            const response = await fetch(this.updateUrl);
            const content = await response.text();
            const versionMatch = content.match(/@version\s+([^\s]+)/);
            
            if (!versionMatch) {
                throw new Error('Could not extract version');
            }
            
            const latestVersion = versionMatch[1].trim();
            this.setStoredValue('lastVersionCheck', now);
            
            if (this.isNewerVersion(latestVersion, this.currentVersion)) {
                this.showUpdateNotification(latestVersion);
            } else if (showNoUpdateMessage) {
                alert(`✅ You're running the latest version!\n\nCurrent: ${this.currentVersion}\nLatest: ${latestVersion}`);
            }
            
        } catch (error) {
            console.error('Update check failed:', error);
            if (showNoUpdateMessage) {
                alert(`❌ Failed to check for updates: ${error.message}`);
            }
        }
    }
    
    isNewerVersion(latest, current) {
        const latestParts = latest.split('.').map(part => parseInt(part, 10));
        const currentParts = current.split('.').map(part => parseInt(part, 10));
        
        const maxLength = Math.max(latestParts.length, currentParts.length);
        while (latestParts.length < maxLength) latestParts.push(0);
        while (currentParts.length < maxLength) currentParts.push(0);
        
        for (let i = 0; i < maxLength; i++) {
            if (latestParts[i] > currentParts[i]) return true;
            if (latestParts[i] < currentParts[i]) return false;
        }
        
        return false;
    }
    
    showUpdateNotification(latestVersion) {
        // Create and show update modal
        const modal = this.createUpdateModal(latestVersion);
        document.body.appendChild(modal);
    }
    
    createUpdateModal(latestVersion) {
        // Modal creation logic here
        const modal = document.createElement('div');
        // ... implementation details ...
        return modal;
    }
    
    getStoredValue(key, defaultValue) {
        const stored = this.storage.getItem(key);
        return stored ? JSON.parse(stored) : defaultValue;
    }
    
    setStoredValue(key, value) {
        this.storage.setItem(key, JSON.stringify(value));
    }
}

// Usage
const updateChecker = new SimpleUpdateChecker({
    currentVersion: '1.0.0',
    updateUrl: 'https://raw.githubusercontent.com/user/repo/main/script.js',
    checkInterval: 24 * 60 * 60 * 1000
});

updateChecker.init();
```

## Conclusion

The update system in WtsMain.user.js provides a robust, user-friendly approach to version management that can be adapted for various project types. The key strengths of this implementation include:

- **Reliability**: Comprehensive error handling and fallback mechanisms
- **User Experience**: Professional UI with clear user choices
- **Flexibility**: Configurable intervals and behavior
- **Maintainability**: Clean separation of concerns and modular design

When adapting this system for other projects, focus on maintaining these core principles while customizing the implementation details to fit your specific requirements and constraints.

---

*This documentation covers the update system as implemented in WtsMain.user.js version 1.3.031. For the most current implementation details, refer to the source code.*