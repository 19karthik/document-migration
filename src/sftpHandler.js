// const Client = require('ssh2-sftp-client');
// const fs = require('fs-extra');
// const path = require('path');
// const sftpConfig = require('./config/sftpConfig');
// const { extractZip } = require('./extractor'); // your unzip function
// const { processBatches } = require('./batchProcessor'); // your zip processor

// const sftp = new Client();

// async function fetchAndProcessFromSFTP(localDownloadDir) {
//   await fs.ensureDir(localDownloadDir);

//   try {
//     await sftp.connect(sftpConfig);
//     const files = await sftp.list(sftpConfig.remoteDir);

//     for (const file of files) {
//       if (file.name.endsWith('.zip')) {
//         const remoteFilePath = `${sftpConfig.remoteDir}/${file.name}`;
//         const localFilePath = path.join(localDownloadDir, file.name);

//         console.log(`Downloading ${file.name}...`);
//         await sftp.get(remoteFilePath, localFilePath);

//         // Optional: remove from SFTP after download
//         await sftp.delete(remoteFilePath);

//         // Process ZIP file
//         const extractedPath = await extractZip(localFilePath, './extracted');
//         await processBatches(extractedPath); // your existing logic
//       }
//     }
//   } catch (err) {
//     console.error('SFTP Error:', err.message);
//   } finally {
//     sftp.end();
//   }
// }

// module.exports = { fetchAndProcessFromSFTP };
