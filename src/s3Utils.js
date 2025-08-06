const AWS = require("aws-sdk");
const fs = require("fs-extra");
const mongoose = require("mongoose");
const path = require("path");
const { exec } = require("child_process");
const util = require("util");
const { S3_UPLOAD_BUCKET_NAME } = require("./config");
const Upload = require("../models/upload"); // Mongoose model for uploads

const execPromise = util.promisify(exec);

mongoose.connect(process.env.MONGO_DB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const s3 = new AWS.S3();

/**
 * Faster download using AWS CLI (parallel multipart)
 */
async function fastDownloadFromS3(bucket, key, targetPath) {
  const s3Uri = `s3://${bucket}/${key}`;
  const command = `aws s3 cp "${s3Uri}" "${targetPath}"`;

  console.log(`Running: ${command}`);

  try {
    const { stdout, stderr } = await execPromise(command);
    if (stdout) console.log("CLI Output:", stdout);
    if (stderr) console.error("CLI Errors:", stderr);
  } catch (err) {
    console.error("Failed to download via aws s3 cp:", err);
    throw err;
  }
}

/**
 * Fallback simple Node stream download (less optimal)
 */
async function fallbackDownloadFromS3(bucket, key, targetPath) {
  const params = { Bucket: bucket, Key: key };
  
  // Step 1: Get object size
  const headData = await s3.headObject(params).promise();
  const totalSize = headData.ContentLength;
  console.log(`Total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

  // Step 2: Download with progress %
  const file = fs.createWriteStream(targetPath);
  let downloadedBytes = 0;

  console.log(`Downloading ${key} via fallback stream with progress...`);

  const s3Stream = s3.getObject(params).createReadStream();

  return new Promise((resolve, reject) => {
    s3Stream
      .on("data", chunk => {
        downloadedBytes += chunk.length;
        const percent = ((downloadedBytes / totalSize) * 100).toFixed(2);
        process.stdout.write(`\rProgress: ${percent}%  (${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB of ${(totalSize / (1024 * 1024)).toFixed(2)} MB)`);
      })
      .on("end", () => {
        console.log("\nFallback download complete.");
        resolve();
      })
      .on("error", err => {
        console.error("Stream download error:", err);
        reject(err);
      })
      .pipe(file);
  });
}


/**
 * Main downloadFile function with update status
 */
async function downloadFile(bucket, key, localPath, objectId) {
  try {
    await Upload.findByIdAndUpdate(objectId, {
      $set: { status: "processing" },
    });
    console.log(`Updated upload status for object ${objectId} to 'processing'`);
  } catch (err) {
    console.error("Error updating upload status:", err);
    throw new Error("Failed to update upload status in database");
  }

  const targetPath = localPath;
  fs.ensureDirSync(path.dirname(targetPath));

  console.log(`Downloading ${key} from bucket ${bucket} to ${targetPath}`);

  // Try fast CLI download first
  try {
    await fastDownloadFromS3(bucket, key, targetPath);
  } catch (err) {
    console.warn("Fast CLI download failed, falling back to stream...");
    await fallbackDownloadFromS3(bucket, key, targetPath);
  }

  return targetPath; // Return downloaded file path
}

/**
 * Upload error log to S3
 */
async function uploadErrorLog(s3ZipKey) {
  const baseName = path.basename(s3ZipKey);
  const tenantLogFilePrefix = baseName.split("-")[0];
  const localLogPath = path.join("logs", `${tenantLogFilePrefix}_logs.txt`);
  const errorKey = baseName.replace(".zip", "_errorfile.txt");

  await s3.upload({
    Bucket: S3_UPLOAD_BUCKET_NAME,
    Key: errorKey,
    Body: fs.createReadStream(localLogPath),
  }).promise();

  console.log(`Uploaded error log as ${errorKey}`);
}

module.exports = { downloadFile, uploadErrorLog };
