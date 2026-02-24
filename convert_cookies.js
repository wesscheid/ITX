const fs = require('fs');
const path = require('path');

try {
    const rawCookies = fs.readFileSync('cookies_ig.txt', 'utf8');
    let allCookies = JSON.parse(rawCookies);
    
    if (!Array.isArray(allCookies) && allCookies.cookies) allCookies = allCookies.cookies;
    
    const netscapeLines = allCookies.map((c) => {
        const domain = c.domain || c.host || '';
        const httpOnly = c.httpOnly === true;
        const prefix = httpOnly ? '#HttpOnly_' : '';
        
        let outDomain = domain;
        if (outDomain && !outDomain.startsWith('.') && outDomain.includes('.') && !httpOnly) {
            outDomain = '.' + outDomain;
        }

        const flag = 'TRUE';
        const pathv = c.path || '/';
        const secure = c.secure ? 'TRUE' : 'FALSE';
        const expires = c.expirationDate ? Math.floor(Number(c.expirationDate)) : 0;
        const name = c.name || '';
        const value = c.value || '';
        return `${prefix}${outDomain}\t${flag}\t${pathv}\t${secure}\t${expires}\t${name}\t${value}`;
    });

    const finalCookies = '# Netscape HTTP Cookie File\n' + netscapeLines.join('\n') + '\n';
    fs.writeFileSync('cookies_netscape.txt', finalCookies);
    console.log('✅ Converted cookies to cookies_netscape.txt');
} catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
}
