const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const fsExtra = require("fs-extra"); // fs-extra allows easy file copying

const {
  EXTRACT_DIR,
  LOG_DIR,
  SYNC_BATCH_SIZE,
  ASYNC_BATCH_SIZE,
  MAX_RETRIES,
  UPLOAD_API_URL,
  UPLOAD_API_URL_ASYNC,
  BACKEND_URL,
} = require("./config");

async function uploadFileSync(filePath) {
  console.log(`Uploading file synchronously: ${filePath}`);
  try {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath));
    // form.append("employeeno",)
    // form.append("section",)
    // form.append("sectionattribute",)
    const response = await axios.post(UPLOAD_API_URL, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

async function uploadBatchAsync(files, tenantId, batchNo, retryCount) {
  try {
    const form = new FormData();

    // Append all files in the batch
    files.forEach((file, index) => {
      form.append(`file${index}`, fs.createReadStream(file));
    });

    form.append(
      "callbackUrl",
      `${BACKEND_URL}/${tenantId}/${batchNo}/${retryCount}`
    );

    const response = await axios.post(UPLOAD_API_URL_ASYNC, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

function createBatches(files, batchSize) {
  const batches = [];
  for (let i = 0; i < files.length; i += batchSize) {
    batches.push(files.slice(i, i + batchSize));
  }
  return batches;
}

function logStatus(tenantId, message) {
  const logFile = path.join(LOG_DIR, `${tenantId}_logs.txt`);
    fsExtra.ensureDirSync(LOG_DIR);
  fs.appendFileSync(logFile, `${new Date().toISOString()} - ${message}\n`);
}

async function processBatchSync(files, tenantId, batchNo) {
  let remaining = new Set(files);
  let retryCount = 0;

  while (retryCount < MAX_RETRIES && remaining.size > 0) {
    console.log(`Processing batch ${batchNo} - Attempt ${retryCount + 1}`);
    const nextTry = new Set();

    for (const file of remaining) {
      const result = await uploadFileSync(file);
      if (result.success ) {
        // nextTry.add(file);
        // logStatus(tenantId, `Failed to upload ${file}: ${result.error}`);
        
        logStatus(tenantId, `Successfully uploaded ${file}`);
      } else if(retryCount==MAX_RETRIES-1) {
        // If this is the last retry, we log the error
        logStatus(tenantId, `Failed to upload ${file}: ${result.error}`);
        
      } else {
        nextTry.add(file);
      }

    }

    remaining = nextTry;
    retryCount++;
  }

  if (remaining.size > 0) {
    logStatus(
      tenantId,
      `Batch ${batchNo} failed after ${MAX_RETRIES} attempts. Failed files: ${Array.from(
        remaining
      ).join(", ")}`
    );
  } else {
    logStatus(tenantId, `Batch ${batchNo} completed successfully`);
  }

  return remaining.size === 0;
}

async function processBatchAsync(files, tenantId, batchNo) {
  // Ensure we only process up to ASYNC_BATCH_SIZE files
  const batchFiles = files.slice(0, ASYNC_BATCH_SIZE);
  const result = await uploadBatchAsync(batchFiles, tenantId, batchNo, 0);

  if (result.success) {
    logStatus(
      tenantId,
      `Started async upload for batch ${batchNo} with ${batchFiles.length} files`
    );
  } else {
    logStatus(
      tenantId,
      `Failed to start async upload for batch ${batchNo}: ${result.error}`
    );
  }
}

async function processBatches(extractedPath, isAsync = false) {
  const batchSize = isAsync ? ASYNC_BATCH_SIZE : SYNC_BATCH_SIZE;

  // Extract tenantId from the directory name
  const dirName = path.basename(extractedPath); // tenant123-payslips_....
  const tenantId = dirName.split("-")[0];

  // Get all files inside extractedPath
  const allFiles = fs
    .readdirSync(extractedPath)
    .map((file) => path.join(extractedPath, file))
    .filter((file) => fs.lstatSync(file).isFile());

  const batches = createBatches(allFiles, batchSize);

  // New batch directory root
  const tenantBatchDir = path.join(EXTRACT_DIR, tenantId);
  await fsExtra.ensureDir(tenantBatchDir);

  for (let i = 0; i < batches.length; i++) {
    const batchFiles = batches[i];
    const batchDir = path.join(tenantBatchDir, `batch${i + 1}`);
    await fsExtra.ensureDir(batchDir);

    const movedFiles = [];

    for (const file of batchFiles) {
      const destPath = path.join(batchDir, path.basename(file));
      await fsExtra.copy(file, destPath); // change to `move` if needed
      movedFiles.push(destPath);
    }

    if (isAsync) {
      await processBatchAsync(movedFiles, tenantId, i + 1);
    } else {
      await processBatchSync(movedFiles, tenantId, i + 1);
    }
  }
  await fsExtra.remove(extractedPath);
  console.log(`Cleaned up original directory: ${extractedPath}`);
}

module.exports = { processBatches, uploadBatchAsync };
