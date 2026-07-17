import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";

export type DeepReportQueueJobData = {
  jobId: string;
};

type QueueRole = "producer" | "worker" | "dispatcher";

declare global {
  var xuanjiDeepReportProducerQueue: Queue<DeepReportQueueJobData> | undefined;
}

export const deepReportQueueName =
  process.env.DEEP_REPORT_QUEUE_NAME?.trim() || "deep-report";

function readPositiveNumber(value: string | undefined, fallback: number) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function getDeepReportRedisUrl(env: NodeJS.ProcessEnv = process.env) {
  const explicit = env.REDIS_URL?.trim();

  if (explicit) {
    return explicit;
  }

  const host = env.REDIS_HOST?.trim() || "127.0.0.1";
  const port = env.REDIS_PORT?.trim() || "6379";

  return `redis://${host}:${port}`;
}

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  const dbText = parsed.pathname.replace(/^\/+/, "");
  const db = dbText ? Number(dbText) : undefined;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: typeof db === "number" && Number.isInteger(db) && db >= 0 ? db : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
  };
}

function getRedisOptions(role: QueueRole): ConnectionOptions {
  const connectTimeout = readPositiveNumber(
    process.env.REDIS_CONNECT_TIMEOUT_MS,
    role === "producer" ? 1000 : 5000,
  );
  const base = parseRedisUrl(getDeepReportRedisUrl());

  if (role === "worker") {
    return {
      ...base,
      maxRetriesPerRequest: null,
      connectTimeout,
      enableReadyCheck: true,
    };
  }

  if (role === "producer") {
    return {
      ...base,
      maxRetriesPerRequest: 1,
      connectTimeout,
      enableOfflineQueue: false,
      enableReadyCheck: true,
    };
  }

  return {
    ...base,
    maxRetriesPerRequest: null,
    connectTimeout,
    enableReadyCheck: true,
  };
}

export function createDeepReportRedisConnection(role: QueueRole): ConnectionOptions {
  return getRedisOptions(role);
}

function getDefaultJobOptions(): JobsOptions {
  return {
    attempts: readPositiveNumber(process.env.DEEP_REPORT_QUEUE_ATTEMPTS, 5),
    backoff: {
      type: "exponential",
      delay: readPositiveNumber(process.env.DEEP_REPORT_QUEUE_BACKOFF_MS, 30_000),
    },
    removeOnComplete: {
      age: readPositiveNumber(process.env.DEEP_REPORT_QUEUE_COMPLETE_AGE_SECONDS, 86_400),
      count: readPositiveNumber(process.env.DEEP_REPORT_QUEUE_COMPLETE_COUNT, 1000),
    },
    removeOnFail: {
      age: readPositiveNumber(process.env.DEEP_REPORT_QUEUE_FAILED_AGE_SECONDS, 604_800),
      count: readPositiveNumber(process.env.DEEP_REPORT_QUEUE_FAILED_COUNT, 5000),
    },
  };
}

export function getDeepReportProducerQueue() {
  if (!globalThis.xuanjiDeepReportProducerQueue) {
    globalThis.xuanjiDeepReportProducerQueue = new Queue<DeepReportQueueJobData>(
      deepReportQueueName,
      {
        connection: createDeepReportRedisConnection("producer"),
        defaultJobOptions: getDefaultJobOptions(),
      },
    );
  }

  return globalThis.xuanjiDeepReportProducerQueue;
}

export async function enqueueDeepReportJob(input: { jobId: string }) {
  const queue = getDeepReportProducerQueue();
  const job = await queue.add(
    "generate",
    { jobId: input.jobId },
    {
      jobId: input.jobId,
    },
  );

  return String(job.id ?? input.jobId);
}
