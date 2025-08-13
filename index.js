// Required Dependencies:
// npm install @aws-sdk/client-sqs @aws-sdk/client-s3 axios dotenv adm-zip

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const AdmZip = require("adm-zip");
const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
} = require("@aws-sdk/client-sqs");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
require("dotenv").config();
const mongoose = require("mongoose");
const Upload = require("./models/upload.js");

mongoose.connect(process.env.MONGO_DB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const EXTRACT_DIR = "extracted";
const LOG_DIR = "logs";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10");
const DUMMY_API_URL = process.env.UPLOAD_API_URL;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "5");
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET_NAME = process.env.S3_UPLOAD_BUCKET_NAME;
const TIMESTAMP = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);

const statusLogPath = path.join(LOG_DIR, `status_${TIMESTAMP}.json`);
const errorsLogPath = path.join(LOG_DIR, `errors_${TIMESTAMP}.txt`);
const errorsFinalPath = path.join(LOG_DIR, `errors_final.txt`);

const sqs = new SQSClient({ region: AWS_REGION });
const s3 = new S3Client({ region: AWS_REGION });

fs.mkdirSync(EXTRACT_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

let statusData = {};

let failedPdfFiles = [];

function extractZip(zipPath, extractTo) {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractTo, true);
  console.log(` Extracted ${zipPath} to ${extractTo}`);
}

function getAllPdfFiles(folder) {
  const results = [];
  const walk = (dir) => {
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
      else if (fullPath.endsWith(".pdf")) results.push(fullPath);
    }
  };
  walk(folder);
  console.log(` Found ${results.length} PDF files in ${folder}`);
  return results.sort();
}

function createBatches(files, batchSize) {
  const batches = [];
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push(files.slice(i, i + batchSize));
  }
  return batches;
}

async function uploadFile(filePath) {
  try {
    const fileData = fs.readFileSync(filePath);
    const response = await axios.post(
      DUMMY_API_URL,
      {
        file: fileData,
      },
      {
        headers: { "Content-Type": "multipart/form-data" },
      }
    );
    if (response.status === 200) {
      cleanupLocalFiles(filePath);
      return true;
    }
    return false;
  } catch (e) {
    console.error(` Error uploading ${filePath}:`);
    return false;
  }
}

async function uploadToS3(filePath, key) {
  try {
    if (!fs.existsSync(filePath)) return;

    const baseKey = path.basename(key);
    baseKey.replace(" ", "_");
    const keyParts = baseKey.split("_");
    // if (keyParts.length < 3) throw new Error("Unexpected key format.");

    const tenantId = keyParts[0].split("-").pop();
    const originalFilename = keyParts.slice(2).join("_");
    const errorFileKey = `errors/${tenantId}_${originalFilename.replace(
      ".zip",
      ""
    )}_errorfile.txt`;

    const body = fs.readFileSync(filePath);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: errorFileKey,
        Body: body,
      })
    );
    console.log(`Uploaded error log to S3 as ${errorFileKey}`);
  } catch (e) {
    console.error("Error uploading error log to S3:", e);
  }
}

function zipFailedPdfs(zipName = "failed_pdfs_bundle.zip") {
  const zip = new AdmZip();
  failedPdfFiles
    .filter(fs.existsSync)
    .forEach((file) => zip.addLocalFile(file));
  const zipPath = path.join(LOG_DIR, zipName);
  zip.writeZip(zipPath);
  return zipPath;
}

async function uploadErrorZipToS3(key) {
  try {
    const zipPath = zipFailedPdfs();
    const baseKey = path.basename(key);
    const keyParts = baseKey.split("_");
    const tenantId = keyParts[0].split("-").pop();
    const originalFilename = keyParts.slice(2).join("_");
    const errorZipKey = `errors/${tenantId}_${originalFilename.replace(
      ".zip",
      ""
    )}_failed_pdfs_bundle.zip`;

    const body = fs.readFileSync(zipPath);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: errorZipKey,
        Body: body,
      })
    );
    console.log(`Uploaded failed PDFs zip to S3 as ${errorZipKey}`);
    return errorZipKey;
  } catch (e) {
    console.error("Error uploading failed PDFs zip to S3:", e);
    return null;
  }
}

async function getErrorZipPresignedUrl(errorZipKey) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: errorZipKey,
  });
  return await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour expiry
}

function clearErrorFiles() {
  if (fs.existsSync(errorsLogPath)) {
    fs.unlinkSync(errorsLogPath);
  }
  if (fs.existsSync(errorsFinalPath)) {
    fs.unlinkSync(errorsFinalPath);
  }
  statusData = {};
}

function cleanupLocalFiles(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(` Deleted local file: ${filePath}`);
    }
  } catch (error) {
    console.error(` Error deleting file ${filePath}:`, error);
  }
}

async function processBatchesWithRetries() {
  console.log(" Starting batch-wise processing with retries...\n");
  const allFiles = getAllPdfFiles(EXTRACT_DIR);
  const batches = createBatches(allFiles, BATCH_SIZE);

  failedPdfFiles = [];

  for (let batchNum = 0; batchNum < batches.length; batchNum++) {
    const batch = batches[batchNum];
    console.log(` Processing Batch ${batchNum + 1}/${batches.length}`);

    let remainingFiles = new Set(batch);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.log(` Attempt ${attempt} for batch ${batchNum + 1}`);
      const currentFailures = new Set();

      for (const filePath of [...remainingFiles]) {
        console.log(` Uploading ${filePath}`);
        const success = await uploadFile(filePath);
        statusData[filePath] = success ? "success" : "failed";

        if (success) remainingFiles.delete(filePath);
        else {
          currentFailures.add(filePath);
          fs.appendFileSync(errorsLogPath, `${filePath}\n`);
        }
      }

      fs.writeFileSync(statusLogPath, JSON.stringify(statusData, null, 2));

      if (remainingFiles.size === 0) break;
      else console.log(` Retrying ${remainingFiles.size} failed files...`);
    }

    if (remainingFiles.size > 0) {
      for (const filePath of remainingFiles) {
        fs.appendFileSync(errorsFinalPath, `${filePath}\n`);
        failedPdfFiles.push(filePath);
      }
    }
  }
}

async function worker() {
  while (true) {
    console.log(" Polling SQS queue...");
    const command = new ReceiveMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 10,
    });

    const response = await sqs.send(command);
    console.log(
      " Received messages:",
      response.Messages ? response.Messages.length : 0
    );
    const messages = response.Messages || [];

    if (!messages.length) continue;

    for (const message of messages) {
      try {
        clearErrorFiles();

        const body = JSON.parse(message.Body);
        const bucket = body.s3Bucket;
        const key = body.s3Key;
        const uploadId = body.documentId;
        const zipPath = `/tmp/${path.basename(key)}`;

        console.log(` Downloading ${key} from ${bucket}...`);
        const zipData = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key })
        );
        const fileStream = fs.createWriteStream(zipPath);
        zipData.Body.pipe(fileStream);

        await new Promise((resolve) => fileStream.on("close", resolve));
        extractZip(zipPath, EXTRACT_DIR);

        await processBatchesWithRetries();
        await uploadToS3(errorsFinalPath, key);
        const errorZipKey = await uploadErrorZipToS3(key);
        let errorZipUrl = null;
        if (errorZipKey) {
          errorZipUrl = await getErrorZipPresignedUrl(errorZipKey);
        }

        // Update the database record
        await Upload.findOneAndUpdate(
          { uploadId },
          {
            status: remainingFiles.size === 0 ? "completed" : "failed",
            errorZipKey: errorZipKey ? null : "Some error info",
            processedAt: new Date(),
          }
        );

        cleanupLocalFiles(zipPath);
        if (fs.existsSync(EXTRACT_DIR)) {
          fs.rmSync(EXTRACT_DIR, { recursive: true, force: true });
          console.log(` Cleaned up extracted directory: ${EXTRACT_DIR}`);
        }

        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: SQS_QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
          })
        );
        console.log(" Job done. Message deleted from queue.");
      } catch (err) {
        console.error(" Processing Error:", err);
      }
    }
  }
}

worker().catch(console.error);
