/**
 * WTS Module Validator - Test script to validate module loading
 * This script can be run in the browser console to check if all WTS modules
 * are properly loaded and exported to the global window scope.
 */

(function() {
    'use strict';
    
    console.log('🔍 WTS Module Validator Starting...');
    
    const requiredModules = [
        { name: 'WTS_Core', expectedType: 'function', description: 'Core system foundation' },
        { name: 'WTS_CSRFManager', expectedType: 'function', description: 'CSRF token management' },
        { name: 'WTS_DataExtractor', expectedType: 'function', description: 'ASIN data extraction' },
        { name: 'WTS_ExportManager', expectedType: 'function', description: 'CSV export functionality' },
        { name: 'WTS_StoreManager', expectedType: 'function', description: 'Store switching and mapping' },
        { name: 'WTS_UIManager', expectedType: 'function', description: 'User interface orchestration' }
    ];
    
    let allValid = true;
    const results = [];
    
    console.log('📋 Checking module availability...\n');
    
    for (const moduleInfo of requiredModules) {
        const moduleName = moduleInfo.name;
        const expectedType = moduleInfo.expectedType;
        const description = moduleInfo.description;
        const actualModule = window[moduleName];
        
        let status = '❌ FAIL';
        let details = '';
        
        if (typeof actualModule === 'undefined') {
            details = 'Module not found in global scope';
            allValid = false;
        } else if (typeof actualModule !== expectedType) {
            details = `Wrong type: expected ${expectedType}, got ${typeof actualModule}`;
            allValid = false;
        } else if (expectedType === 'function') {
            // Additional validation for classes
            try {
                const hasPrototype = actualModule.prototype && typeof actualModule.prototype === 'object';
                if (hasPrototype) {
                    status = '✅ PASS';
                    details = 'Valid class constructor';
                } else {
                    details = 'Not a valid class constructor';
                    allValid = false;
                }
            } catch (error) {
                details = `Validation error: ${error.message}`;
                allValid = false;
            }
        } else {
            status = '✅ PASS';
            details = 'Valid module';
        }
        
        results.push({
            name: moduleName,
            status,
            details,
            description
        });
        
        console.log(`${status} ${moduleName}`);
        console.log(`   Description: ${description}`);
        console.log(`   Details: ${details}\n`);
    }
    
    // Summary
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(50));
    
    const passCount = results.filter(r => r.status.includes('PASS')).length;
    const failCount = results.filter(r => r.status.includes('FAIL')).length;
    
    console.log(`✅ Passed: ${passCount}/${requiredModules.length}`);
    console.log(`❌ Failed: ${failCount}/${requiredModules.length}`);
    
    if (allValid) {
        console.log('\n🎉 ALL MODULES VALID! WTS should initialize properly.');
    } else {
        console.log('\n⚠️  ISSUES DETECTED! WTS may fail to initialize.');
        console.log('\nTroubleshooting:');
        console.log('1. Check that all @require URLs are accessible');
        console.log('2. Verify network connectivity');
        console.log('3. Check browser console for script loading errors');
        console.log('4. Ensure modules are properly exporting to window scope');
    }
    
    // Test core instantiation if available
    if (window.WTS_Core && typeof window.WTS_Core === 'function') {
        console.log('\n🧪 Testing WTS_Core instantiation...');
        try {
            const testCore = new window.WTS_Core();
            console.log('✅ WTS_Core can be instantiated successfully');
            console.log(`   Version: ${testCore.version || 'unknown'}`);
            console.log(`   Initialized: ${testCore.initialized || false}`);
        } catch (error) {
            console.log(`❌ WTS_Core instantiation failed: ${error.message}`);
        }
    }
    
    console.log('\n🔍 Module Validator Complete');
    
    return {
        allValid,
        results,
        passCount,
        failCount
    };
})();