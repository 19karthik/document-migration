const unzipper = require('unzipper');
const fs = require('fs-extra');
const path = require('path');

async function extractZip(zipPath, extractTo) {
  const directory = await unzipper.Open.file(zipPath);

  await Promise.all(
    directory.files.map(async (file) => {
      if (file.type === 'File') {
        const filePath = path.join(extractTo, file.path);

        // Ensure parent directory exists
        await fs.ensureDir(path.dirname(filePath));

        return new Promise((resolve, reject) => {
          file
            .stream()
            .pipe(fs.createWriteStream(filePath))
            .on('finish', resolve)
            .on('error', reject);
        });
      }
    })
  );

  console.log(`Extracted ${zipPath} to ${extractTo}`);
}


extractZip('/home/dhanunjaya.s/Downloads/c21f733b-d805-4ed9-8819-13e511886421-7050_1748511580082_payslips.zip', 'textracted')
// module.exports = { extractZip };
