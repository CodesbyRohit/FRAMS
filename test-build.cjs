const { exec } = require('child_process');
const fs = require('fs');

exec('npx vite build', (error, stdout, stderr) => {
  fs.writeFileSync('build_output.txt', stdout + '\n\n' + stderr);
});
