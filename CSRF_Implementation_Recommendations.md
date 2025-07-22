# CSRF Token Extraction - Implementation Recommendations

## Summary of Diagnosis

After comprehensive analysis of the CSRF token extraction in [`WtsMain.js`](WtsMain.js:143-167), I've identified **2 primary issues** that are most likely causing extraction failures:

### 🎯 **Primary Issue #1: Limited Regex Pattern Coverage**
The current single regex pattern `/["']anti-csrftoken-a2z["']\s*:\s*["']([^"']+)["']/` may miss common JavaScript formatting variations.

### 🎯 **Primary Issue #2: Timing/Availability Problems**
Token extraction runs immediately without considering that the token might be loaded asynchronously or after DOM ready.

## Recommended Implementation Strategy

### Phase 1: Add Debugging to Current Implementation

**Before making changes**, confirm the diagnosis by adding logging to the existing [`extractCSRFToken()`](WtsMain.js:143) function:

```javascript
function extractCSRFToken() {
    console.log("=== CSRF Token Debug ===");
    console.log("Page state:", document.readyState);
    console.log("Scripts found:", document.querySelectorAll('script').length);
    
    // Existing meta tag check with logging
    const metaToken = document.querySelector('meta[name="anti-csrftoken-a2z"]');
    if (metaToken) {
        const token = metaToken.getAttribute('content');
        console.log("✅ Meta tag token:", token);
        return token;
    }
    console.log("❌ No meta tag found");
    
    // Enhanced script search with logging
    const scripts = document.querySelectorAll('script');
    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        const content = script.textContent || script.innerText;
        
        if (content.includes('anti-csrftoken-a2z')) {
            console.log(`Script ${i+1} contains token reference`);
            console.log("Content preview:", content.substring(0, 200));
            
            const tokenMatch = content.match(/["']anti-csrftoken-a2z["']\s*:\s*["']([^"']+)["']/);
            if (tokenMatch) {
                console.log("✅ Script token:", tokenMatch[1]);
                return tokenMatch[1];
            }
        }
    }
    console.log("❌ No script token found");
    
    // Existing data attribute check with logging
    const tokenElement = document.querySelector('[data-anti-csrftoken-a2z]');
    if (tokenElement) {
        const token = tokenElement.getAttribute('data-anti-csrftoken-a2z');
        console.log("✅ Data attribute token:", token);
        return token;
    }
    console.log("❌ No data attribute found");
    
    console.log("=== All methods failed ===");
    return null;
}
```

### Phase 2: Implement Improved Version

Replace the current [`extractCSRFToken()`](WtsMain.js:143) function with the enhanced version from [`improved_csrf_extraction.js`](improved_csrf_extraction.js):

#### Key Improvements:

1. **Multiple Regex Patterns**: 6 different patterns to catch various JavaScript formatting
2. **Comprehensive Search Methods**: Meta tags, scripts, data attributes, window objects, hidden inputs, cookies
3. **Detailed Logging**: Step-by-step debugging information
4. **Token Validation**: Format and length validation
5. **Retry Logic**: Optional retry mechanism with delays

#### Integration Steps:

1. **Replace the function** in [`WtsMain.js`](WtsMain.js:143-167):
   ```javascript
   // Replace lines 143-167 with the improved version
   function extractCSRFToken() {
       return extractCSRFTokenImproved();
   }
   ```

2. **Add the improved function** before the existing one:
   ```javascript
   // Insert the full extractCSRFTokenImproved() function from improved_csrf_extraction.js
   ```

3. **Optional: Add retry logic** to the [`switchToStore()`](WtsMain.js:135) function:
   ```javascript
   async function switchToStore(storeCode) {
       // ... existing code ...
       
       // Replace immediate extraction with retry version
       const csrfToken = await extractCSRFTokenWithRetry(3, 1000);
       if (!csrfToken) {
           alert('❌ Unable to find CSRF token after multiple attempts. Please refresh the page and try again.');
           return;
       }
       
       // ... rest of existing code ...
   }
   ```

### Phase 3: Testing and Validation

#### Test Scenarios:
1. **Fresh page load** - Test immediately after page loads
2. **Delayed execution** - Test after 2-3 seconds
3. **Different page types** - Homepage, product pages, checkout
4. **Network conditions** - Slow loading, cached pages

#### Validation Commands:
```javascript
// Test in browser console:
extractCSRFTokenImproved();

// Test with retry:
extractCSRFTokenWithRetry(3, 1000).then(token => console.log("Final result:", token));
```

## Quick Fix for Immediate Testing

If you want to test the diagnosis immediately, add this temporary logging to [`WtsMain.js`](WtsMain.js:169):

```javascript
// Add after line 169 (const csrfToken = extractCSRFToken();)
console.log("CSRF extraction result:", csrfToken);
console.log("Page readyState:", document.readyState);
console.log("Scripts with 'anti-csrftoken-a2z':", 
    Array.from(document.querySelectorAll('script'))
    .filter(s => (s.textContent || s.innerText).includes('anti-csrftoken-a2z'))
    .length
);
```

## Expected Outcomes

### If Issue #1 (Regex) is the problem:
- Logging will show scripts containing 'anti-csrftoken-a2z' but no token extracted
- Improved regex patterns will find the token

### If Issue #2 (Timing) is the problem:
- Logging will show `document.readyState` as 'loading' or few scripts found
- Retry mechanism will succeed on later attempts

### If both issues exist:
- Initial attempts fail due to timing
- Later attempts fail due to regex limitations
- Improved version with retry will solve both

## Files Created for Reference

1. **[`CSRF_Token_Analysis.md`](CSRF_Token_Analysis.md)** - Detailed technical analysis
2. **[`improved_csrf_extraction.js`](improved_csrf_extraction.js)** - Complete improved implementation
3. **[`csrf_token_test.html`](csrf_token_test.html)** - Test environment for validation
4. **This file** - Implementation roadmap

## Next Steps

1. **Confirm diagnosis** by adding logging to current implementation
2. **Test on real Whole Foods pages** to validate assumptions
3. **Implement improved version** based on findings
4. **Monitor success rates** and adjust as needed

The improved implementation provides comprehensive debugging that will clearly show where the current extraction is failing and ensure reliable token extraction across different scenarios.