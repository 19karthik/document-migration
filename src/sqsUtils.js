const AWS = require("aws-sdk");
const { SQS_QUEUE_URL } = require("./config");
const sqs = new AWS.SQS();

async function receiveMessages() {
    console.log('Receiving messages from SQS...');
  const params = {
    QueueUrl: SQS_QUEUE_URL,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 10,
  };
  const response = await sqs.receiveMessage(params).promise();
  return response.Messages || [];
}

async function deleteMessage(receiptHandle) {
  await sqs
    .deleteMessage({ QueueUrl: SQS_QUEUE_URL, ReceiptHandle: receiptHandle })
    .promise();
  console.log("Deleted message from SQS");
}

module.exports = { receiveMessages, deleteMessage };
