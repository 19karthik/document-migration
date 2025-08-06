const express = require("express");
const fs = require("fs");
const cors = require("cors");
const path = require("path");
const { uploadErrorLog } = require("./s3Utils");
const { uploadBatchAsync } = require("./batchProcessor");
const { EXTRACT_DIR,LOG_DIR } = require("./config");
const { fetchAndProcessFromSFTP } = require('./sftpHandler');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors())
app.get("/", (req, res) => res.send("Worker running!"));

app.get("/callback/:tenantId/:batchNo/:retryCount", async (req, res) => {
  const { tenantId, batchNo, retryCount } = req.params;
  console.log(
    `Callback received for tenant ${tenantId}, batch ${batchNo}, retry ${retryCount}`
  );

  const { status } = req.query;
  const currentRetry = parseInt(retryCount);

  const logFile = path.join(LOG_DIR, `${tenantId}.logs.txt`);
  fs.mkdirSync(LOG_DIR, { recursive: true });

  if (status === "success") {
    console.log(
      `Batch ${batchNo} for tenant ${tenantId} uploaded successfully.`
    );
    fs.appendFileSync(
      logFile,
      `${new Date().toISOString()} - Batch ${batchNo} uploaded successfully\n`
    );

    return res.status(200).json({
      status: "success",
      message: "Batch uploaded successfully",
    });
  }

  const batchPath = path.join(EXTRACT_DIR, tenantId, `batch${batchNo}`);

  if (!fs.existsSync(batchPath)) {
    return res.status(404).json({
      status: "error",
      message: "Batch directory not found",
    });
  }

  if (currentRetry >= 5) {
    fs.appendFileSync(
      logFile,
      `${new Date().toISOString()} - Batch ${batchNo} failed after maximum retries\n`
    );

    try {
      await uploadErrorLog(logFile, `${tenantId}_batch${batchNo}`);
    } catch (err) {
      console.error("Error uploading logs to S3:", err);
    }

    return res.status(200).json({
      status: "failed",
      message: "Max retries reached",
    });
  }

  const files = fs
    .readdirSync(batchPath)
    .filter((file) => file.endsWith(".pdf"))
    .map((file) => path.join(batchPath, file));

  const nextRetry = currentRetry + 1;

  try {
    const result = await uploadBatchAsync(files, tenantId, batchNo, nextRetry);
    if (!result.success) {
      fs.appendFileSync(
        logFile,
        `${new Date().toISOString()} - Failed to upload batch ${batchNo} on retry ${currentRetry}: ${
          result.error
        }\n`
      );
    }
  } catch (err) {
    console.error(`Error processing batch ${batchNo}:`, err);
    fs.appendFileSync(
      logFile,
      `${new Date().toISOString()} - Error processing batch ${batchNo} on retry ${currentRetry}: ${
        err.message
      }\n`
    );
  }

  res.status(200).json({
    status: "retrying",
    nextRetry,
    filesProcessed: files.length,
  });
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});


app.post('/sftp-fetch', async (req, res) => {
  try {
    await fetchAndProcessFromSFTP('./downloads');
    res.status(200).send('SFTP fetch and processing complete');
  } catch (err) {
    res.status(500).send('Error during SFTP fetch');
  }
});

// Start worker
require("./worker")();


