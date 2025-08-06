const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema({
  tenantId: String,
  batchName: String,
  files: [String],
  retryCount: { type: Number, default: 0 },
//   lastTriedAt: Date,
});

module.exports = mongoose.model("Batch", batchSchema);
