// const { receiveMessages, deleteMessage } = require('./sqsUtils');
const { receiveMessages, deleteMessage } = require('./sqsUtils');
const { downloadFile, uploadErrorLog } = require('./s3Utils');
const { extractZip } = require('./zipUtils');
const { processBatches } = require('./batchProcessor');
const { EXTRACT_DIR } = require('./config');
const path = require('path');
const fs = require('fs-extra');
const { timeStamp } = require('console');

module.exports = async function startWorker() {
  fs.ensureDirSync(EXTRACT_DIR);

  while (true) {
    const messages = await receiveMessages();
    if (!messages.length) continue;

    for (const msg of messages) {
      const { s3Bucket, s3Key ,objectId} = JSON.parse(msg.Body);
      
      const localZipPath = `tmp/${path.basename(s3Key)}`;
     
      try {

        targetpath=await downloadFile(s3Bucket, s3Key, localZipPath,objectId);
        extracted_path=await extractZip(targetpath, EXTRACT_DIR);
        await processBatches(extracted_path);
        await uploadErrorLog(s3Key);
        await deleteMessage(msg.ReceiptHandle);
      } catch (err) {
        console.error('Processing error:', err);
      }
    }


    await new Promise(resolve => setTimeout(resolve, 2000));
  }
};
