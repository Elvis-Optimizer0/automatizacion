const fs = require('fs');
const { execSync } = require('child_process');

const files = fs.readdirSync('app', { recursive: true }).filter(f => f.endsWith('.js'));
let failed = false;

console.log('Checking syntax for', files.length, 'files...');

for (const f of files) {
    const fullPath = 'app/' + f;
    try {
        execSync('node --check ' + fullPath, { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
        console.log('  ✓', f);
    } catch (e) {
        console.log('  ❌ FAILED:', f);
        console.error(e.message);
        failed = true;
    }
}

if (failed) {
    console.error('\n❌ Syntax check failed!');
    process.exit(1);
} else {
    console.log('\n✅ All syntax checks passed!');
}