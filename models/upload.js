const mongoose = require('mongoose');

const Upload = mongoose.model('Upload', new mongoose.Schema({
  uploadId: { type: String, required: true, unique: true },
  tenantId: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, enum: ['single_zip', 'multiple_files'], required: true },
  fileCount: { type: Number, default: 1 },
  totalSize: { type: Number, required: true },
  s3Key: { type: String, required: true },
  status: {
    type: String,
    enum: ['queued','processing', 'completed', 'failed'],
    default: 'processing'
  },
  successCount: { type: Number, default: 0 },
  failureCount: { type: Number, default: 0 },
  messageId: String,
  errorMessage: String,
  uploadedAt: { type: Date, default: Date.now },
  completedAt: Date
}, { timestamps: true }));
 
module.exports = Upload;
