import { CreateQueueCommand, SQSClient } from "@aws-sdk/client-sqs";

export const queueName = process.env.QUEUE_NAME ?? "webhook-events";

export function createSqsClient() {
  return new SQSClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    endpoint: process.env.SQS_ENDPOINT ?? "http://localhost:4566",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
    },
  });
}

export async function ensureQueue(client = createSqsClient()) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const response = await client.send(new CreateQueueCommand({ QueueName: queueName }));
      if (!response.QueueUrl) {
        throw new Error("LocalStack did not return a QueueUrl");
      }
      return response.QueueUrl;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureQueue()
    .then((queueUrl) => console.log(`queue ready: ${queueUrl}`))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
