require('dotenv').config();

module.exports = {
  EXTRACT_DIR: 'extracted',
  LOG_DIR: 'logs',
  SYNC_BATCH_SIZE: parseInt(process.env.SYNC_BATCH_SIZE || '10'),
  ASYNC_BATCH_SIZE: 20, // Fixed size for async API
  UPLOAD_API_URL: process.env.UPLOAD_API_URL,
  UPLOAD_API_URL_ASYNC: process.env.UPLOAD_API_URL_ASYNC,
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:3033/callback',
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '5'),
  SQS_QUEUE_URL: process.env.SQS_QUEUE_URL,
  AWS_REGION: process.env.AWS_REGION,
  S3_UPLOAD_BUCKET_NAME: process.env.S3_UPLOAD_BUCKET_NAME,
  MONGO_DB_URL: process.env.MONGO_DB_URL || 'mongodb://localhost:27017/payslip',
};