import { Worker } from "bullmq";
import {
  createDeepReportRedisConnection,
  deepReportQueueName,
  type DeepReportQueueJobData,
} from "@/lib/deep-report-queue";
import {
  dispatchPendingDeepReportJobs,
  processDeepReportJob,
} from "@/lib/deep-report-job";

function readPositiveNumber(value: string | undefined, fallback: number) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
}

const concurrency = readPositiveNumber(process.env.DEEP_REPORT_WORKER_CONCURRENCY, 2);
const dispatchIntervalMs = readPositiveNumber(
  process.env.DEEP_REPORT_DISPATCH_INTERVAL_MS,
  30_000,
);
const maxAttempts = readPositiveNumber(process.env.DEEP_REPORT_QUEUE_ATTEMPTS, 5);

async function runDispatcher() {
  try {
    const result = await dispatchPendingDeepReportJobs({
      take: readPositiveNumber(process.env.DEEP_REPORT_DISPATCH_BATCH_SIZE, 50),
    });

    if (
      result.dispatched > 0 ||
      result.failed > 0 ||
      result.resetQueued > 0 ||
      result.resetRunning > 0
    ) {
      console.info(
        JSON.stringify({
          event: "deep_report_dispatcher",
          ...result,
        }),
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Deep report dispatcher failed. ${message}`);
  }
}

const worker = new Worker<DeepReportQueueJobData>(
  deepReportQueueName,
  async (job) => {
    await processDeepReportJob({
      jobId: job.data.jobId,
      attempt: job.attemptsMade + 1,
      maxAttempts,
    });
  },
  {
    connection: createDeepReportRedisConnection("worker"),
    concurrency,
    lockDuration: readPositiveNumber(process.env.DEEP_REPORT_WORKER_LOCK_MS, 10 * 60_000),
  },
);

worker.on("completed", (job) => {
  console.info(
    JSON.stringify({
      event: "deep_report_job_completed",
      bullJobId: job.id,
      jobId: job.data.jobId,
    }),
  );
});

worker.on("failed", (job, error) => {
  console.warn(
    JSON.stringify({
      event: "deep_report_job_failed",
      bullJobId: job?.id,
      jobId: job?.data.jobId,
      attemptsMade: job?.attemptsMade,
      error: error.message,
    }),
  );
});

worker.on("error", (error) => {
  console.warn(`Deep report worker error. ${error.message}`);
});

void runDispatcher();
const dispatcherTimer = setInterval(() => {
  void runDispatcher();
}, dispatchIntervalMs);

async function shutdown(signal: string) {
  console.info(`Deep report worker received ${signal}; shutting down.`);
  clearInterval(dispatcherTimer);
  await worker.close();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT").finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM").finally(() => process.exit(0));
});
