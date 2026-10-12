const fs = require('fs');
let c = fs.readFileSync('app/ui/renderer.js', 'utf8');

// Replace all btn.addEventListener('click', with safeAddEventListener(btn, 'click',
c = c.replace(/btn\.addEventListener\('click',/g, "safeAddEventListener(btn, 'click',");
c = c.replace(/\$\$\((.*?)\)\.forEach\(btn => \{\s*btn\.addEventListener\('click',/g, "$\$\$(\$1).forEach(btn => { safeAddEventListener(btn, 'click',");
c = c.replace(/\$\('#([^']+)'\)\.addEventListener\('([^']+)',/g, "safeAddEventListener(\$('#\$1'), '\$2',");
c = c.replace(/\$\('#([^']+)'\)\.addEventListener\('input',/g, "safeAddEventListener(\$('#\$1'), 'input',");
c = c.replace(/\$\('#([^']+)'\)\.addEventListener\('change',/g, "safeAddEventListener(\$('#\$1'), 'change',");

fs.writeFileSync('app/ui/renderer.js', c);
console.log('Done');