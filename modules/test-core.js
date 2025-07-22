/**
 * Test script for WTS Core module
 * This script tests the basic functionality of the WTS_Core module
 */

// Test function to verify WTS Core functionality
async function testWTSCore() {
    console.log('=== WTS Core Module Test ===');
    
    try {
        // Create core instance
        const core = new WTS_Core();
        console.log('✓ WTS Core instance created');
        
        // Test initialization
        const initResult = await core.initialize();
        console.log(`✓ Core initialization: ${initResult ? 'SUCCESS' : 'FAILED'}`);
        
        // Test logging system
        core.setDebugMode(true);
        core.log('Test log message', 'info');
        core.log('Test debug message', 'debug');
        core.log('Test warning message', 'warn');
        console.log('✓ Logging system tested');
        
        // Test event system
        let eventReceived = false;
        const listenerId = core.on('test:event', (data) => {
            eventReceived = true;
            console.log('✓ Event received:', data);
        });
        
        core.emit('test:event', { message: 'Hello from event system!' });
        console.log(`✓ Event system: ${eventReceived ? 'SUCCESS' : 'FAILED'}`);
        
        // Test storage system
        await core.setValue('test_key', { data: 'test_value', number: 42 });
        const retrievedValue = await core.getValue('test_key');
        const storageTest = retrievedValue && retrievedValue.data === 'test_value' && retrievedValue.number === 42;
        console.log(`✓ Storage system: ${storageTest ? 'SUCCESS' : 'FAILED'}`);
        
        // Test validation utilities
        const validationTests = [
            core.isString('test', 'string test'),
            core.isNumber(42, 'number test'),
            core.isFunction(() => {}, 'function test'),
            core.isObject({}, 'object test'),
            !core.isString(42, 'invalid string test') // Should return false
        ];
        const validationSuccess = validationTests.every(test => test === true);
        console.log(`✓ Validation utilities: ${validationSuccess ? 'SUCCESS' : 'FAILED'}`);
        
        // Test module registration
        const testModule = {
            version: '1.0.0',
            initialize: async function() {
                this.core.log('Test module initialized', 'info');
                return true;
            },
            cleanup: function() {
                this.core.log('Test module cleaned up', 'info');
            }
        };
        
        const regResult = core.registerModule('test-module', testModule);
        console.log(`✓ Module registration: ${regResult ? 'SUCCESS' : 'FAILED'}`);
        
        const initModResult = await core.initializeModule('test-module');
        console.log(`✓ Module initialization: ${initModResult ? 'SUCCESS' : 'FAILED'}`);
        
        // Test system info
        const sysInfo = core.getSystemInfo();
        console.log('✓ System info:', sysInfo);
        
        // Cleanup
        core.off('test:event', listenerId);
        await core.deleteValue('test_key');
        core.unregisterModule('test-module');
        
        console.log('=== All Tests Completed Successfully ===');
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

// Export test function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { testWTSCore };
} else if (typeof window !== 'undefined') {
    window.testWTSCore = testWTSCore;
}